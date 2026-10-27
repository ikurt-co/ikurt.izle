import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { jwtVerify } from "jose";

const id = "[a-zA-Z0-9_-]{1,96}";
const mediaRoute = new RegExp("^/hls/(" + id + "/" + id + ")/([a-zA-Z0-9_.-]+\\.(?:m3u8|mp4|m4s|ts))$");
const same = (a = "", b = "") => b.length >= 32 && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
async function readBody(request, maximum = 4096) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > maximum) throw new Error("Body too large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function bytes(response, maximum) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > maximum) throw new Error("Media too large"); chunks.push(Buffer.from(chunk)); }
  return Buffer.concat(chunks);
}
export function createMediaGateway(config, fetcher = fetch) {
  if ([config.signingKey, config.gatewayKey, config.originKey, config.publishKey].some(value => typeof value !== "string" || value.length < 32)) throw new Error("Missing gateway secrets");
  const upstream = new URL(config.upstream);
  if (upstream.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(upstream.hostname) || upstream.username || upstream.password || upstream.pathname !== "/") throw new Error("MediaMTX must be loopback-only");
  const app = new URL(config.appOrigin);
  if (!["https:", "http:"].includes(app.protocol) || (app.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(app.hostname))) throw new Error("Invalid application origin");
  const authorizationUrl = new URL("/api/internal/media/authorize", app).href;
  const key = new TextEncoder().encode(config.signingKey);
  const rates = new Map();
  async function claims(ticket) {
    const { payload } = await jwtVerify(ticket, key, { issuer: "ikurt-izle", audience: "ikurt-media", algorithms: ["HS256"],
      requiredClaims: ["exp", "iat", "sub", "sh", "tid", "lid", "cid", "gid", "path"] });
    if (payload.gid !== config.gatewayId || payload.path !== payload.tid + "/" + payload.cid ||
        typeof payload.iat !== "number" || typeof payload.exp !== "number" || payload.exp - payload.iat > 90 ||
        payload.iat > Date.now() / 1000 + 5 || !new RegExp("^" + id + "/" + id + "$").test(payload.path)) throw new Error("Invalid media scope");
    return payload;
  }
  async function authorize(ticket) {
    const payload = await claims(ticket);
    const response = await fetcher(authorizationUrl, { method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { authorization: "Bearer " + ticket, "x-ikurt-gateway-id": config.gatewayId, "x-ikurt-gateway-key": config.gatewayKey } });
    if (!response.ok || (await response.json()).path !== payload.path) throw new Error("Access denied");
    return payload;
  }
  const originHeaders = { authorization: "Basic " + Buffer.from("bridge:" + config.originKey).toString("base64") };
  async function originFetch(input) {
    let target = new URL(input);
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await fetcher(target, { headers: originHeaders, redirect: "manual", signal: AbortSignal.timeout(12000) });
      if (![301, 302, 307, 308].includes(result.status)) return result;
      const location = result.headers.get("location");
      if (!location) throw new Error("Invalid origin redirect");
      const next = new URL(location, target);
      // MediaMTX v1.21 adds its own HLS session query. Never follow another host or media path.
      if (next.origin !== upstream.origin || next.pathname !== target.pathname || next.username || next.password) throw new Error("Unsafe origin redirect");
      await result.body?.cancel(); target = next;
    }
    throw new Error("Too many origin redirects");
  }
  function send(response, status, body, headers = {}) {
    response.writeHead(status, { "cache-control": "no-store, private", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", ...headers });
    response.end(body);
  }
  return createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin && origin !== config.appOrigin) return send(response, 403, "");
    if (origin) {
      response.setHeader("access-control-allow-origin", origin);
      response.setHeader("access-control-allow-credentials", "true");
      response.setHeader("vary", "Origin");
    }
    if (request.method === "OPTIONS") return send(response, 204, "", { "access-control-allow-methods": "GET, HEAD, POST, OPTIONS", "access-control-allow-headers": "Authorization, Content-Type", "access-control-max-age": "300" });
    const url = new URL(request.url, "http://gateway.local");
    const address = request.socket.remoteAddress ?? "unknown";
    const bucket = Math.floor(Date.now() / 60_000);
    for (const [ip, entry] of rates) if (entry.bucket !== bucket) rates.delete(ip);
    if (!rates.has(address) && rates.size >= 10_000) return send(response, 429, "");
    const entry = rates.get(address) ?? { bucket, count: 0 };
    rates.set(address, entry);
    if (++entry.count > 12000) return send(response, 429, "");
    try {
      if (url.pathname === "/internal/mediamtx-auth" && request.method === "POST") {
        if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address)) return send(response, 403, "");
        const body = await readBody(request);
        const allowed = body.action === "read" && body.user === "bridge" && same(body.password, config.originKey) ||
          body.action === "publish" && (config.publishPaths ?? ["ten_makaristan/cam_synthetic"]).includes(body.path) &&
            ["synthetic", "publisher"].includes(body.user) && same(body.password, config.publishKey);
        return send(response, allowed ? 204 : 403, "");
      }
      if (url.pathname === "/health" && request.method === "GET") return send(response, 200, '{"service":"ikurt-media-gateway"}', { "content-type": "application/json" });
      if (url.pathname === "/probe" && request.method === "POST") {
        if (!same(request.headers["x-ikurt-gateway-key"], config.gatewayKey)) return send(response, 403, "");
        const body = await readBody(request);
        if (typeof body.path !== "string" || !new RegExp("^" + id + "/" + id + "$").test(body.path)) return send(response, 400, "");
        let ready = false;
        try {
          const upstreamResponse = await originFetch(new URL(body.path + "/index.m3u8", upstream));
          ready = upstreamResponse.ok && (await bytes(upstreamResponse, 128 * 1024)).toString().startsWith("#EXTM3U");
        } catch { /* Redacted probe failure. */ }
        return send(response, 200, JSON.stringify({ ready }), { "content-type": "application/json" });
      }
      if (url.pathname === "/session" && request.method === "POST") {
        if (origin !== config.appOrigin) return send(response, 403, "");
        const ticket = request.headers.authorization?.match(/^Bearer (.{1,4096})$/)?.[1];
        if (!ticket) return send(response, 401, "");
        const payload = await authorize(ticket);
        const secure = config.appOrigin.startsWith("https:") ? "; Secure" : "";
        return send(response, 204, "", { "set-cookie": "ikurt_media=" + ticket + "; Path=/hls/" + payload.path + "/; HttpOnly; SameSite=Strict; Max-Age=" + Math.max(0, Math.floor(payload.exp - Date.now() / 1000)) + secure });
      }
      const match = url.pathname.match(mediaRoute);
      if (!match || !["GET", "HEAD"].includes(request.method)) return send(response, 404, "");
      const ticket = request.headers.cookie?.split(";").map(item => item.trim()).find(item => item.startsWith("ikurt_media="))?.slice("ikurt_media=".length);
      if (!ticket) return send(response, 401, "");
      let payload;
      try { payload = await authorize(ticket); } catch { return send(response, 403, ""); }
      if (payload.path !== match[1]) return send(response, 403, "");
      const source = new URL(match[1] + "/" + match[2], upstream);
      for (const name of ["_HLS_msn", "_HLS_part", "_HLS_skip"]) {
        const value = url.searchParams.get(name);
        if (value && /^(?:[0-9]{1,12}|YES|v2)$/.test(value)) source.searchParams.set(name, value);
      }
      const mtxSession = url.searchParams.get("session");
      if (mtxSession && /^[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}$/.test(mtxSession)) source.searchParams.set("session", mtxSession);
      const result = await originFetch(source);
      if (!result.ok) return send(response, result.status === 404 ? 404 : 503, "");
      const body = await bytes(result, match[2].endsWith(".m3u8") ? 128 * 1024 : 8 * 1024 * 1024);
      if (match[2].endsWith(".m3u8")) {
        const text = body.toString();
        if (!text.startsWith("#EXTM3U")) return send(response, 503, "");
        const uris = [...text.matchAll(/URI="([^"]+)"/g)].map(item => item[1]);
        uris.push(...text.split(/\r?\n/).filter(line => line && !line.startsWith("#")));
        for (const uri of uris) {
          const child = new URL(uri, "http://gateway.local" + url.pathname);
          if (child.origin !== "http://gateway.local" || !child.pathname.startsWith("/hls/" + payload.path + "/") ||
              !mediaRoute.test(child.pathname)) return send(response, 503, "");
        }
      }
      return send(response, 200, request.method === "HEAD" ? "" : body, { "content-type": match[2].endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : match[2].endsWith(".ts") ? "video/mp2t" : "video/mp4" });
    } catch { return send(response, 503, ""); } // No URLs, tokens, cookies or source credentials in logs.
  });
}

export function gatewayConfig() {
  return { appOrigin: process.env.APP_ORIGIN, upstream: process.env.MEDIAMTX_ORIGIN ?? "http://127.0.0.1:8888",
    gatewayId: process.env.GATEWAY_ID, signingKey: process.env.MEDIA_SIGNING_KEY, gatewayKey: process.env.GATEWAY_KEY,
    originKey: process.env.MEDIA_ORIGIN_KEY, publishKey: process.env.MEDIA_PUBLISH_KEY };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.loadEnvFile(new URL("./.local/media.env", import.meta.url));
  const config = gatewayConfig();
  try { config.publishPaths = JSON.parse(await readFile(new URL("./.local/filter-paths.json", import.meta.url), "utf8")); }
  catch { config.publishPaths = ["ten_makaristan/cam_synthetic"]; }
  const server = createMediaGateway(config);
  server.listen(9080, "127.0.0.1", () => console.log("Yerel medya gateway: 127.0.0.1:9080 (kayıt ve ses kapalı)"));
}
