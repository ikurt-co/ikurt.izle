import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { SignJWT, decodeJwt } from "jose";
import { loadWorker } from "../scripts/load-worker.mjs";
import { createMediaGateway } from "../streaming/gateway.mjs";

const mod = await loadWorker(false);
const dev = await loadWorker(true);
const { isOpen, validHours } = await loadWorker(false, "media.ts");
const cameraId = "cam_makaristan_cocuk_oyun_alani";
const blankWeek = () => ({ sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] });
function fixture(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(name => name.endsWith(".sql")).sort()) db.exec(readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"));
  db.exec(`INSERT INTO stream_gateways(id,name,tenant_id,public_base_url,status) VALUES('gw_local','Test','ten_makaristan','https://media.ikurt.net','pending');
UPDATE cameras SET gateway_id='gw_local';
INSERT INTO stream_policies(location_id,tenant_id,weekly_hours) VALUES('loc_makaristan_malatya','ten_makaristan',NULL);
INSERT INTO access_links(id,tenant_id,location_id,camera_id,code,session_duration_minutes) VALUES('test_link','ten_makaristan','loc_makaristan_malatya','${cameraId}','test-link',60);`);
  class Statement {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...args) { return new Statement(this.sql, args); }
    async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
    async run() { return { meta: db.prepare(this.sql).run(...this.args) }; }
  }
  const secret = () => randomBytes(32).toString("base64url");
  const gatewayKey = secret();
  const env = { MEDIA_ENABLED: "1", MEDIA_SIGNING_KEY: secret(),
    MEDIA_GATEWAY_KEYS: JSON.stringify({ gw_local: gatewayKey }), MEDIA_GATEWAY_ORIGINS: "https://media.ikurt.net",
    CAMERA_CREDENTIAL_KEY: randomBytes(32).toString("base64"),
    ikurt_izle_db: { prepare: sql => new Statement(sql) }, IZLE_LINKS: { get() { throw new Error("No live KV"); } } };
  const call = (path, { method = "GET", headers = {}, body, local = false } = {}) => (local ? dev : mod).default.fetch(new Request((local ? "http://localhost" : "https://izle.ikurt.net") + path,
    { method, headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.123", ...headers }, ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }), env);
  const session = async () => {
    const response = await call("/api/public/access/test-link/session", { method: "POST" });
    assert.equal(response.status, 201);
    return response.json();
  };
  const ticket = async token => {
    const response = await call("/api/public/media-ticket", { method: "POST", headers: { authorization: "Bearer " + token } });
    assert.equal(response.status, 200);
    return response.json();
  };
  const authorize = ticket => call("/api/internal/media/authorize", { method: "POST", headers: { authorization: "Bearer " + ticket, "x-ikurt-gateway-id": "gw_local", "x-ikurt-gateway-key": gatewayKey } });
  return { db, env, call, session, ticket, authorize, gatewayKey };
}

test("media grant is session-bound, at most 90 seconds, no RTSP/credentials exposed", async t => {
  const f = fixture(t);
  const session = await f.session();
  assert.ok(Date.parse(session.expires_at) - Date.now() > 59 * 60_000);
  const ticket = await f.ticket(session.token);
  const claims = decodeJwt(ticket.ticket);
  assert.equal(claims.path, "ten_makaristan/" + cameraId);
  assert.equal(claims.gid, "gw_local");
  assert.equal(claims.exp - claims.iat, 90);
  assert.equal(ticket.playback_url, "https://media.ikurt.net/hls/ten_makaristan/" + cameraId + "/index.m3u8");
  assert.doesNotMatch(JSON.stringify(ticket), /rtsp:|source_host|username|password|192\.0\.2/);
  assert.equal((await f.authorize(ticket.ticket)).status, 200);
  const invalid = await f.call("/api/public/media-ticket", { method: "POST" });
  assert.equal(invalid.status, 401);
  assert.equal((await f.call("/api/internal/media/sources")).status, 403);
});

test("expired and forged media tickets are denied", async t => {
  const f = fixture(t); const ticket = await f.ticket((await f.session()).token);
  const payload = decodeJwt(ticket.ticket);
  const expired = await new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setExpirationTime(0).sign(new TextEncoder().encode(f.env.MEDIA_SIGNING_KEY));
  assert.equal((await f.authorize(expired)).status, 403);
  const parts = ticket.ticket.split("."); parts[2] = (parts[2][0] === "A" ? "B" : "A") + parts[2].slice(1);
  assert.equal((await f.authorize(parts.join("."))).status, 403);
  assert.equal((await f.call("/api/internal/media/authorize", { method: "POST", headers: { authorization: "Bearer " + ticket.ticket } })).status, 403);
});

test("every media authorization rechecks link/camera/location/tenant/session and hours", async t => {
  const f = fixture(t); const ticket = await f.ticket((await f.session()).token);
  const gates = [
    ["UPDATE access_links SET status='revoked'", "UPDATE access_links SET status='active'"],
    ["UPDATE cameras SET enabled=0", "UPDATE cameras SET enabled=1"],
    ["UPDATE locations SET status='inactive'", "UPDATE locations SET status='active'"],
    ["UPDATE tenants SET status='suspended'", "UPDATE tenants SET status='active'"],
    ["UPDATE viewer_sessions SET status='revoked'", "UPDATE viewer_sessions SET status='active'"],
    ["UPDATE stream_gateways SET status='disabled'", "UPDATE stream_gateways SET status='pending'"],
  ];
  for (const [close, restore] of gates) {
    f.db.exec(close); assert.equal((await f.authorize(ticket.ticket)).status, 403, close);
    f.db.exec(restore); assert.equal((await f.authorize(ticket.ticket)).status, 200);
  }
  f.db.prepare("UPDATE stream_policies SET weekly_hours=?").run(JSON.stringify(blankWeek()));
  assert.equal((await f.authorize(ticket.ticket)).status, 403);
  assert.equal((await f.call("/api/public/access/test-link/session", { method: "POST" })).status, 403);
  f.db.exec("UPDATE stream_policies SET weekly_hours=NULL; UPDATE viewer_sessions SET expires_at=datetime('now','-1 minute')");
  assert.equal((await f.authorize(ticket.ticket)).status, 403);
});

test("signed but mismatched tenant/camera/gateway claims cannot cross scope", async t => {
  const f = fixture(t); const ticket = await f.ticket((await f.session()).token);
  for (const patch of [{ tid: "foreign" }, { cid: "foreign" }, { lid: "foreign" }, { gid: "foreign" }, { sub: "foreign" }, { path: "foreign/camera" }]) {
    const bad = await new SignJWT({ ...decodeJwt(ticket.ticket), ...patch }).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode(f.env.MEDIA_SIGNING_KEY));
    assert.equal((await f.authorize(bad)).status, 403);
  }
  f.db.exec("INSERT INTO tenants(id,name,slug) VALUES('foreign','Foreign','foreign'); UPDATE stream_gateways SET tenant_id='foreign'");
  assert.equal((await f.authorize(ticket.ticket)).status, 403);
});

test("viewer capacity insertion and per-IP session rate checks are atomic", async t => {
  const f = fixture(t);
  f.db.exec("UPDATE stream_policies SET max_viewers=1");
  const responses = await Promise.all(Array.from({ length: 4 }, () => f.call("/api/public/access/test-link/session", { method: "POST" })));
  assert.equal(responses.filter(response => response.status === 201).length, 1);
  assert.equal(responses.filter(response => response.status === 429).length, 3);
  assert.notEqual(f.db.prepare("SELECT ip_hash FROM viewer_sessions").get().ip_hash, "192.0.2.123");
  f.db.exec("UPDATE stream_policies SET max_viewers=100");
  const burst = await Promise.all(Array.from({ length: 35 }, () => f.call("/api/public/access/test-link/session", { method: "POST" })));
  assert.equal(burst.filter(response => response.status === 201).length, 29);
  assert.equal(burst.filter(response => response.status === 429).length, 6);
});

test("weekly schedule validates timezone, split windows and closed defaults", async t => {
  const f = fixture(t);
  const week = blankWeek(); week.wed = [["09:00", "12:00"], ["13:00", "22:00"]];
  assert.equal(validHours(week), true);
  assert.equal(isOpen({ weekly_hours: JSON.stringify(week), timezone: "Europe/Istanbul" }, new Date("2026-10-21T07:00:00Z")), true);
  assert.equal(isOpen({ weekly_hours: JSON.stringify(week), timezone: "Europe/Istanbul" }, new Date("2026-10-21T09:30:00Z")), false);
  assert.equal(isOpen({ weekly_hours: "{", timezone: "Europe/Istanbul" }), false);
  week.wed = [["22:00", "09:00"]]; assert.equal(validHours(week), false);
  f.db.exec("DELETE FROM stream_policies");
  assert.equal((await f.call("/api/public/access/test-link/session", { method: "POST" })).status, 403);
});

test("policy and gateway administration remain protected; invalid JSON does not create configuration", async t => {
  const f = fixture(t);
  const path = "/api/admin/stream-policies?location_id=loc_makaristan_malatya";
  assert.equal((await f.call(path)).status, 403);
  for (const body of ["{", {}, { session_minutes: 60, max_viewers: 25, timezone: "Europe/Istanbul", weekly_hours: "{" }]) {
    assert.equal((await f.call(path, { method: "PUT", body, local: true })).status, 400);
  }
  assert.equal((await f.call("/api/admin/gateways", { method: "POST", body: { id: "bad", name: "Bad", public_base_url: "http://evil.example" }, local: true })).status >= 400, true);
});

test("read-only gateway sources require the paired gateway key; public grants never reveal encrypted sources", async t => {
  const f = fixture(t);
  const username = await mod.encryptCredential("test-nvr-user", f.env.CAMERA_CREDENTIAL_KEY);
  const password = await mod.encryptCredential("test-nvr-password", f.env.CAMERA_CREDENTIAL_KEY);
  f.db.prepare("UPDATE cameras SET username_enc=?,password_enc=?,source_host='192.0.2.5',source_port=554,channel_number=7").run(username, password);
  const response = await f.call("/api/internal/media/sources", { headers: { "x-ikurt-gateway-id": "gw_local", "x-ikurt-gateway-key": f.gatewayKey } });
  assert.equal(response.status, 200);
  const data = await response.json(); assert.equal(data.sources[0].password, "test-nvr-password");
  const grant = await f.ticket((await f.session()).token);
  assert.doesNotMatch(JSON.stringify(grant), /test-nvr|192\.0\.2\.5|source_host|password_enc/);
  assert.equal((await f.call("/api/admin/cameras/" + cameraId, { method: "PATCH", local: true, body: { gateway_id: "not-owned" } })).status, 400);
});

test("real gateway HTTP protects playlists, segments and cookies; revoked sessions cannot continue", async t => {
  const f = fixture(t);
  const upstream = async input => {
    const url = new URL(input);
    if (url.hostname === "izle.ikurt.net") return mod.default.fetch(new Request(input, upstream.lastOptions), f.env);
    assert.equal(url.hostname, "127.0.0.1", "Origin credentials must never reach an external redirect");
    if (upstream.unsafe) return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
    if (!url.searchParams.has("session")) return new Response(null, { status: 302, headers: { location: url.pathname + "?session=12345678-1234-1234-1234-123456789abc" } });
    return new Response(url.pathname.endsWith(".m3u8") ? '#EXTM3U\n#EXT-X-MAP:URI="init.mp4?session=12345678-1234-1234-1234-123456789abc"\nsegment.mp4?session=12345678-1234-1234-1234-123456789abc\n' : new Uint8Array([0, 1, 2, 3]), { status: 200 });
  };
  const proxyFetch = (input, options) => { upstream.lastOptions = options; return upstream(input); };
  const gateway = createMediaGateway({ appOrigin: "https://izle.ikurt.net", upstream: "http://127.0.0.1:8888", gatewayId: "gw_local",
    signingKey: f.env.MEDIA_SIGNING_KEY, gatewayKey: f.gatewayKey, originKey: randomBytes(32).toString("base64url"), publishKey: randomBytes(32).toString("base64url") }, proxyFetch);
  await new Promise(resolve => gateway.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { gateway.closeAllConnections(); gateway.close(resolve); }));
  const base = "http://127.0.0.1:" + gateway.address().port;
  const media = "/hls/ten_makaristan/" + cameraId + "/";
  assert.equal((await fetch(base + media + "index.m3u8")).status, 401);
  assert.equal((await fetch(base + media + "segment.mp4")).status, 401);
  const grant = await f.ticket((await f.session()).token);
  const handshake = await fetch(base + "/session", { method: "POST", headers: { origin: "https://izle.ikurt.net", authorization: "Bearer " + grant.ticket } });
  assert.equal(handshake.status, 204);
  const cookie = handshake.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly; SameSite=Strict; Max-Age=\d+; Secure/);
  const headers = { cookie: cookie.split(";")[0], origin: "https://izle.ikurt.net" };
  assert.equal((await fetch(base + media + "index.m3u8", { headers })).status, 200);
  assert.equal((await fetch(base + media + "segment.mp4", { headers })).status, 200);
  assert.equal((await fetch(base + media + "segment.mp4?session=12345678-1234-1234-1234-123456789abc", { headers })).status, 200);
  upstream.unsafe = true;
  assert.equal((await fetch(base + media + "segment.mp4", { headers })).status, 503);
  upstream.unsafe = false;
  assert.equal((await fetch(base + "/hls/foreign/camera/segment.mp4", { headers })).status, 403);
  assert.equal((await fetch(base + media + "segment.mp4", { headers: { ...headers, origin: "https://evil.example" } })).status, 403);
  assert.equal((await fetch(base + "/internal/mediamtx-auth", { method: "POST", body: JSON.stringify({ action: "read", user: "", password: "" }) })).status, 403);
  f.db.exec("UPDATE access_links SET status='revoked'");
  assert.equal((await fetch(base + media + "index.m3u8", { headers })).status, 403);
  assert.equal((await fetch(base + media + "segment.mp4", { headers })).status, 403);
});
