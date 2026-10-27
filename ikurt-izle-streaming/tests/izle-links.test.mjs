import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { loadWorker } from "../scripts/load-worker.mjs";
import { createRecords, generateIzleLinks, OUTPUT_FILES, TOKEN_BYTES, toKvBulk } from "../scripts/generate-izle-links.mjs";

// Production mode with an in-memory read-only KV stub. No Cloudflare, credentials or D1.
const { default: worker } = await loadWorker(false);
const token = Buffer.alloc(TOKEN_BYTES, 0x42).toString("base64url");
const metadata = {
  version: 1, product_code: "izle-001", status: "unassigned", target_url: null,
  tenant_id: null, location_id: null, camera_id: null, assigned_at: null,
  updated_at: "2026-10-07T20:00:00.000Z",
};

test("public product paths invoke the Worker before the SPA without widening admin routing", () => {
  const config = ts.parseConfigFileTextToJson("wrangler.jsonc",
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(config.error, undefined);
  const routes = config.config.assets.run_worker_first;
  for (const path of ["/api/*", "/admin", "/admin/*", "/p", "/p/*"]) assert.ok(routes.includes(path));
  assert.equal(routes.includes("/c/*"), false);
  assert.equal(config.config.kv_namespaces.find(binding => binding.binding === "IZLE_LINKS").id,
    "ebd040c1f9a942c38247f732085317a1");
});

function requestRecord(record, { path = "/p/" + token, method = "GET", error = null } = {}) {
  let reads = 0;
  const env = {
    IZLE_LINKS: {
      async get(key, options) {
        reads++;
        assert.equal(key, token);
        assert.deepEqual(options, { type: "json" });
        if (error) throw error;
        return record;
      },
      put() { throw new Error("KV writes are forbidden"); },
    },
    ikurt_izle_db: { prepare() { throw new Error("Product routes must not touch D1"); } },
    ASSETS: { fetch() { throw new Error("Product routes must not fall through to the SPA"); } },
  };
  return { response: worker.fetch(new Request("https://izle.ikurt.net" + path, { method }), env), reads: () => reads };
}

test("unknown public token returns a Turkish 404 without admin authentication", async () => {
  const call = requestRecord(null);
  const response = await call.response;
  assert.equal(response.status, 404);
  assert.equal(call.reads(), 1);
  assert.equal(response.headers.has("location"), false);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(await response.text(), /Bağlantı bulunamadı/);
});

test("unassigned and active with null target show a notice rather than redirect/500", async () => {
  for (const status of ["unassigned", "active"]) {
    const response = await requestRecord({ ...metadata, status }).response;
    assert.equal(response.status, 200);
    assert.equal(response.headers.has("location"), false);
    assert.match(await response.text(), /henüz atanmadı/);
  }
  const response = await requestRecord({ ...metadata, target_url: "/c/viewer" }).response;
  assert.equal(response.status, 200); // An unassigned record never redirects, even with a stale target.
});

test("disabled product does not redirect even when a target exists", async () => {
  const response = await requestRecord({ ...metadata, status: "disabled", target_url: "/c/viewer" }).response;
  assert.equal(response.status, 403);
  assert.equal(response.headers.has("location"), false);
  assert.match(await response.text(), /kullanıma kapalı/);
});

test("active product redirects only to a viewer on the canonical application", async () => {
  for (const target_url of ["/c/ExistingViewer_123", "https://izle.ikurt.net/c/ExistingViewer_123"]) {
    const response = await requestRecord({ ...metadata, status: "active", target_url }).response;
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://izle.ikurt.net/c/ExistingViewer_123");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  }
});

test("external, malformed and non-viewer targets never create open redirects", async () => {
  const targets = [
    "https://evil.example/c/viewer", "//evil.example/c/viewer", "//izle.ikurt.net/c/viewer",
    "https://izle.ikurt.net.evil.example/c/viewer", "https://izle.ikurt.net@evil.example/c/viewer",
    "https://evil.example@izle.ikurt.net/c/viewer", "https://izle.ikurt.net:444/c/viewer",
    "http://izle.ikurt.net/c/viewer", "javascript:alert(1)", "data:text/html,test",
    "/admin", "/api/admin/cameras", "/c/", "/c/viewer/extra", "/c/%2F%2Fevil.example",
    "/c/viewer#redirect", "/c/viewer\\evil", "/c/viewer\r\nLocation:https://evil.example",
    " https://izle.ikurt.net/c/viewer", "", 42,
  ];
  for (const target_url of targets) {
    const response = await requestRecord({ ...metadata, status: "active", target_url }).response;
    assert.equal(response.status, 503, String(target_url));
    assert.equal(response.headers.has("location"), false, String(target_url));
  }
});

test("only bounded source/UTM fields are forwarded without replacing stored query parameters", async () => {
  const response = await requestRecord({
    ...metadata, status: "active", target_url: "/c/viewer?utm_source=stored&table=1",
  }, { path: "/p/" + token + "?source=nfc&utm_source=override&utm_medium=qr&redirect=https://evil.example&session=attacker&token=secret&utm_term=" + "x".repeat(129) + "&utm_content=%0D%0A" }).response;
  const target = new URL(response.headers.get("location"));
  assert.equal(target.searchParams.get("source"), "nfc");
  assert.equal(target.searchParams.get("utm_source"), "stored");
  assert.equal(target.searchParams.get("utm_medium"), "qr");
  assert.equal(target.searchParams.get("table"), "1");
  for (const key of ["redirect", "session", "token", "utm_term", "utm_content"]) assert.equal(target.searchParams.has(key), false);
});

test("invalid tokens/methods, bad metadata and KV failures remain safe and do not expose data", async () => {
  for (const path of ["/p", "/p/", "/p/izle-001", "/p/" + token + "/extra", "/p/%2F" + token]) {
    const call = requestRecord(metadata, { path });
    assert.equal((await call.response).status, 404);
    assert.equal(call.reads(), 0);
  }
  const post = requestRecord(metadata, { method: "POST" });
  const method = await post.response;
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET, HEAD");
  assert.equal(post.reads(), 0);
  const head = await requestRecord(metadata, { method: "HEAD" }).response;
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  for (const record of [{ ...metadata, version: 2 }, { ...metadata, status: "unexpected" }, "bad data", {}]) {
    const response = await requestRecord(record).response;
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("location"), false);
  }
  const unavailable = await requestRecord(null, { error: new Error("private diagnostic") }).response;
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /private diagnostic/);
  const notice = await requestRecord({ ...metadata, product_code: "<script>alert(1)</script>" }).response;
  assert.doesNotMatch(await notice.text(), /<script>/);
});

test("generator creates all 100 products, unique 192-bit URL-safe tokens and correct KV values", () => {
  const records = createRecords();
  assert.equal(records.length, 100);
  assert.equal(new Set(records.map(record => record.public_token)).size, 100);
  assert.deepEqual(records.map(record => record.product_code),
    Array.from({ length: 100 }, (_, index) => "izle-" + String(index + 1).padStart(3, "0")));
  for (const record of records) {
    assert.match(record.public_token, /^[A-Za-z0-9_-]{32}$/);
    assert.equal(Buffer.from(record.public_token, "base64url").length, TOKEN_BYTES);
    assert.equal(Buffer.from(record.public_token, "base64url").toString("base64url"), record.public_token);
    assert.notEqual(record.public_token, record.product_code);
    assert.equal(record.kv_key, record.public_token);
    assert.equal(record.public_url, "https://izle.ikurt.net/p/" + record.public_token);
    assert.equal(record.status, "unassigned");
    for (const field of ["target_url", "tenant_id", "location_id", "camera_id", "assigned_at"]) assert.equal(record[field], null);
    assert.equal(new Date(record.updated_at).toISOString(), record.updated_at);
  }
  for (const [index, entry] of toKvBulk(records).entries()) {
    const record = records[index];
    assert.equal(entry.key, record.public_token);
    assert.deepEqual(JSON.parse(entry.value), {
      version: 1, product_code: record.product_code, status: "unassigned", target_url: null,
      tenant_id: null, location_id: null, camera_id: null, assigned_at: null, updated_at: record.updated_at,
    });
  }
});

test("generator outputs matching JSON/CSV/bulk and refuses repeat execution", async () => {
  const directory = await mkdtemp(join(tmpdir(), "izle-generator-"));
  try {
    const result = await generateIzleLinks(directory);
    const before = await Promise.all(OUTPUT_FILES.map(file => readFile(join(directory, file), "utf8")));
    assert.deepEqual(JSON.parse(before[0]), result.records);
    assert.deepEqual(JSON.parse(before[2]), toKvBulk(result.records));
    const csv = before[1].replace(/^\uFEFF/, "").trim().split("\r\n");
    assert.equal(csv.length, 101);
    assert.equal(csv[0].split(",").length, 11);
    const rows = csv.slice(1).map(line => line.split(",").map(cell => cell.slice(1, -1)));
    for (const [index, row] of rows.entries()) {
      assert.equal(row[0], result.records[index].product_code);
      assert.equal(row[1], result.records[index].public_token);
      assert.equal(row[2], result.records[index].public_url);
      assert.equal(row[4], "unassigned");
      for (const value of row.slice(5, 10)) assert.equal(value, "");
    }
    await assert.rejects(generateIzleLinks(directory), /üzerine yazılmadı/);
    assert.deepEqual(await Promise.all(OUTPUT_FILES.map(file => readFile(join(directory, file), "utf8"))), before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an existing CSV alone blocks all output creation and simultaneous runs cannot overwrite", async () => {
  const directory = await mkdtemp(join(tmpdir(), "izle-existing-"));
  const concurrent = await mkdtemp(join(tmpdir(), "izle-concurrent-"));
  try {
    await writeFile(join(directory, OUTPUT_FILES[1]), "existing management data");
    await assert.rejects(generateIzleLinks(directory), /üzerine yazılmadı/);
    assert.deepEqual(await readdir(directory), [OUTPUT_FILES[1]]);
    assert.equal(await readFile(join(directory, OUTPUT_FILES[1]), "utf8"), "existing management data");
    const results = await Promise.allSettled([generateIzleLinks(concurrent), generateIzleLinks(concurrent)]);
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    const winner = results.find(result => result.status === "fulfilled").value;
    assert.deepEqual(JSON.parse(await readFile(join(concurrent, OUTPUT_FILES[0]), "utf8")), winner.records);
    assert.deepEqual(JSON.parse(await readFile(join(concurrent, OUTPUT_FILES[2]), "utf8")), toKvBulk(winner.records));
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(concurrent, { recursive: true, force: true });
  }
});
