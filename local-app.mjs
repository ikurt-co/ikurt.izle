import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadWorker } from "../scripts/load-worker.mjs";
process.loadEnvFile(new URL("./.local/media.env", import.meta.url));
const db = new DatabaseSync(":memory:");
for (const file of (await readdir(new URL("../migrations/", import.meta.url))).filter(name => name.endsWith(".sql")).sort()) {
  db.exec(await readFile(new URL("../migrations/" + file, import.meta.url), "utf8"));
}
db.exec(`INSERT INTO stream_gateways(id,name,provider,public_base_url,status,tenant_id) VALUES('gw_local','Yerel sentetik test','mediamtx','http://localhost:9080','pending','ten_makaristan');
INSERT INTO cameras(id,tenant_id,location_id,gateway_id,name,slug,enabled,stream_status,audio_enabled,recording_enabled)
VALUES('cam_synthetic','ten_makaristan','loc_makaristan_malatya','gw_local','SENTETİK TEST — gerçek kamera değil','synthetic',1,'pending',0,0);
INSERT INTO access_links(id,tenant_id,location_id,camera_id,code,status,session_duration_minutes)
VALUES('link_synthetic','ten_makaristan','loc_makaristan_malatya','cam_synthetic','local-synthetic','active',60);`);
db.exec("INSERT INTO stream_policies(location_id,tenant_id,weekly_hours) VALUES('loc_makaristan_malatya','ten_makaristan',NULL)");
class Statement {
  constructor(sql, args = []) { this.sql = sql; this.args = args; }
  bind(...args) { return new Statement(this.sql, args); }
  async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async run() { return { meta: db.prepare(this.sql).run(...this.args) }; }
}
const env = {
  MEDIA_ENABLED: "1", MEDIA_SIGNING_KEY: process.env.MEDIA_SIGNING_KEY,
  MEDIA_GATEWAY_KEYS: JSON.stringify({ gw_local: process.env.GATEWAY_KEY }),
  MEDIA_GATEWAY_ORIGINS: "http://localhost:9080",
  CAMERA_CREDENTIAL_KEY: Buffer.alloc(32, 42).toString("base64"), // Synthetic in-memory fixture only; never used for NVR credentials.
  IZLE_LINKS: { get: async () => null },
  ikurt_izle_db: { prepare: sql => new Statement(sql), batch: async statements => {
    db.exec("BEGIN"); try { const result = []; for (const statement of statements) result.push(await statement.run()); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  } },
};
const { default: worker } = await loadWorker(true);
const assets = new URL("../dist/client/", import.meta.url);
const mime = { js: "text/javascript", css: "text/css", png: "image/png", html: "text/html", webmanifest: "application/manifest+json" };
async function staticAsset(path) {
  const file = new URL("." + path, assets);
  if (!fileURLToPath(file).startsWith(fileURLToPath(assets))) return new Response(null, { status: 404 });
  try { return new Response(await readFile(file), { headers: { "content-type": mime[path.split(".").pop()] ?? "application/octet-stream" } }); }
  catch { return new Response(await readFile(new URL("index.html", assets)), { headers: { "content-type": "text/html; charset=utf-8" } }); }
}
env.ASSETS = { fetch: request => staticAsset(new URL(request.url).pathname) };
const server = createServer(async (request, response) => {
  try {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) if (typeof value === "string") headers.set(name, value);
    headers.set("cf-connecting-ip", request.socket.remoteAddress ?? "127.0.0.1");
    const url = new URL(request.url, "http://localhost:5173");
    let result;
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/p/")) {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 64 * 1024) throw new Error("Body too large"); chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      result = await worker.fetch(new Request(url, { method: request.method, headers, ...(!["GET", "HEAD"].includes(request.method) ? { body } : {}) }), env);
    } else result = await staticAsset(url.pathname === "/" ? "/index.html" : url.pathname);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch { response.writeHead(500); response.end("Yerel test isteği tamamlanamadı."); }
});
server.listen(5173, "127.0.0.1", () => console.log("Yalnız sentetik test: http://localhost:5173/c/local-synthetic — uzak D1/KV kullanılmıyor."));
process.on("SIGINT", () => server.close(() => { db.close(); process.exit(); }));
