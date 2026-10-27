import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const app = "http://localhost:5173";
const origin = "http://localhost:9080";
const path = "/hls/ten_makaristan/cam_synthetic/";
const get = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(16000) });
const result = { syntheticOnly: true, rawOriginAnonymousDenied: false, gatewayAnonymousDenied: false, playlist: false, decodedFrames: 0, revocationDenied: false };
const raw = await get("http://127.0.0.1:8888/ten_makaristan/cam_synthetic/index.m3u8");
assert.ok([401, 403].includes(raw.status), "MediaMTX anonim okuma kapalı olmalı");
result.rawOriginAnonymousDenied = true;
assert.equal((await get(origin + path + "index.m3u8")).status, 401);
assert.equal((await get(origin + path + "segment.mp4")).status, 401);
result.gatewayAnonymousDenied = true;
const sessionResponse = await get(app + "/api/public/access/local-synthetic/session", { method: "POST" });
assert.equal(sessionResponse.status, 201);
const session = await sessionResponse.json();
const grantResponse = await get(app + "/api/public/media-ticket", { method: "POST", headers: { authorization: "Bearer " + session.token } });
assert.equal(grantResponse.status, 200);
const grant = await grantResponse.json();
const handshake = await get(grant.session_url, { method: "POST", headers: { origin: app, authorization: "Bearer " + grant.ticket } });
assert.equal(handshake.status, 204);
const cookie = handshake.headers.get("set-cookie").split(";")[0];
const playlist = await get(grant.playback_url, { headers: { cookie } });
if (process.argv.includes("--expect-offline")) {
  assert.ok([404, 503].includes(playlist.status));
  console.log(JSON.stringify({ syntheticOnly: true, controlledOfflineStatus: playlist.status }));
} else {
assert.equal(playlist.status, 200);
assert.match(playlist.headers.get("cache-control"), /no-store/);
assert.match(await playlist.text(), /^#EXTM3U/);
result.playlist = true;
const child = spawn(fileURLToPath(new URL("./.local/tools/ffmpeg/bin/ffmpeg.exe", import.meta.url)),
  ["-hide_banner", "-loglevel", "error", "-headers", "Cookie: " + cookie + "\r\n", "-i", grant.playback_url, "-t", "2", "-an", "-progress", "pipe:1", "-f", "null", "-"],
  { stdio: ["ignore", "pipe", "ignore"], windowsHide: true, timeout: 25000 });
child.stdout.on("data", chunk => {
  const frames = [...chunk.toString().matchAll(/frame=(\d+)/g)].map(match => Number(match[1]));
  result.decodedFrames = Math.max(result.decodedFrames, ...frames);
});
const code = await new Promise(resolve => { child.on("exit", resolve); child.on("error", () => resolve(-1)); });
assert.equal(code, 0, "Sentetik HLS görüntüsü çözülmeli");
assert.ok(result.decodedFrames > 0);
const revoke = await get(app + "/api/admin/access-links/link_synthetic", { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"status":"revoked"}' });
assert.equal(revoke.status, 200);
assert.equal((await get(grant.playback_url, { headers: { cookie } })).status, 403);
result.revocationDenied = true;
await get(app + "/api/admin/access-links/link_synthetic", { method: "PATCH", headers: { "content-type": "application/json" }, body: '{"status":"active"}' });
await writeFile(new URL("./.local/smoke-result.json", import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log("Yalnız sentetik yayın test edildi. Video kaydedilmedi; kamera veya canlı D1/KV kullanılmadı.");
}
