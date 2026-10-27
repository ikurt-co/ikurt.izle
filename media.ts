import { SignJWT, jwtVerify } from "jose";

export interface MediaEnvironment {
  ikurt_izle_db: D1Database;
  MEDIA_ENABLED?: string;
  MEDIA_SIGNING_KEY?: string;
  MEDIA_GATEWAY_KEYS?: string;
  MEDIA_GATEWAY_ORIGINS?: string;
}
interface Context {
  tenant: string; joins: string; eligible: string;
  sha256(value: string): Promise<string>;
  decrypt(value: string): Promise<string>;
}
interface Policy {
  session_minutes: number; max_viewers: number; timezone: string; weekly_hours: string | null;
}
interface MediaSession {
  id: string; expires_at: string; session_token_hash: string;
  tenant_id: string; location_id: string; camera_id: string; gateway_id: string;
  public_base_url: string; gateway_status: string;
}
const defaults: Policy = { session_minutes: 60, max_viewers: 25, timezone: "Europe/Istanbul",
  weekly_hours: JSON.stringify({ sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] }) };
const identifier = /^[a-zA-Z0-9_-]{1,96}$/;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const denied = (status = 403) => json({ ok: false, error: "MEDIA_DENIED", message: "Yayın erişimi doğrulanamadı veya izleme saatleri sona erdi." }, status);
function key(env: MediaEnvironment) {
  if (!env.MEDIA_SIGNING_KEY || env.MEDIA_SIGNING_KEY.length < 32) throw new Error("Media not configured");
  return new TextEncoder().encode(env.MEDIA_SIGNING_KEY);
}
function constantEqual(a: string, b: string): boolean {
  if (a.length !== b.length || b.length < 32) return false;
  let difference = 0;
  for (let index = 0; index < b.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
function gatewaySecret(env: MediaEnvironment, id: string): string {
  try { const keys = JSON.parse(env.MEDIA_GATEWAY_KEYS ?? "{}") as Record<string, string>;
    return typeof keys[id] === "string" ? keys[id] : ""; } catch { return ""; }
}
async function smallJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const reader = request.body?.getReader(); if (!reader) return null;
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
      if (size > 8192) { await reader.cancel(); return null; } chunks.push(part.value); }
    const data = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const body: unknown = JSON.parse(new TextDecoder().decode(data));
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}
function gatewayAuthorized(request: Request, env: MediaEnvironment): string | null {
  const id = request.headers.get("x-ikurt-gateway-id") ?? "";
  const given = request.headers.get("x-ikurt-gateway-key") ?? "";
  return identifier.test(id) && constantEqual(given, gatewaySecret(env, id)) ? id : null;
}
export function gatewayOrigin(value: string, env: MediaEnvironment): string {
  const url = new URL(value);
  const local = import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(url.hostname);
  const allowed = (env.MEDIA_GATEWAY_ORIGINS ?? "").split(",").map(item => item.trim());
  if ((!local && url.protocol !== "https:") || !["http:", "https:"].includes(url.protocol) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash || !allowed.includes(url.origin)) {
    throw new Error("Gateway origin not allowed");
  }
  return url.origin;
}
export async function locationPolicy(env: MediaEnvironment, tenant: string, location: string): Promise<Policy> {
  return await env.ikurt_izle_db.prepare("SELECT session_minutes, max_viewers, timezone, weekly_hours FROM stream_policies WHERE tenant_id = ? AND location_id = ?")
    .bind(tenant, location).first<Policy>() ?? defaults;
}
type Hours = Record<string, [string, string][]>;
const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function minute(value: string) { const [hour, minutes] = value.split(":").map(Number); return hour * 60 + minutes; }
export function validHours(value: unknown): value is Hours {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const hours = value as Hours;
  if (Object.keys(hours).some(day => !days.includes(day))) return false;
  return days.every(day => Array.isArray(hours[day]) && hours[day].length <= 3 && hours[day].every((range, index) =>
    Array.isArray(range) && range.length === 2 && range.every(time => typeof time === "string" && /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/.test(time)) &&
    minute(range[0]) < minute(range[1]) && (index === 0 || minute(hours[day][index - 1][1]) <= minute(range[0]))));
}
export function isOpen(policy: Policy, now = new Date()): boolean {
  if (policy.weekly_hours === null) return true;
  try {
    const hours: unknown = JSON.parse(policy.weekly_hours);
    if (!validHours(hours)) return false;
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: policy.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const get = (name: string) => parts.find(part => part.type === name)?.value ?? "";
    const current = Number(get("hour")) * 60 + Number(get("minute"));
    return hours[get("weekday").toLowerCase()].some(([start, end]) => current >= minute(start) && current < minute(end));
  } catch { return false; }
}
async function eligibleSession(env: MediaEnvironment, hash: string, ctx: Context): Promise<MediaSession | null> {
  const session = await env.ikurt_izle_db.prepare(`SELECT v.id, v.expires_at, v.session_token_hash,
    v.tenant_id, v.location_id, v.camera_id, c.gateway_id, g.public_base_url, g.status AS gateway_status
    FROM viewer_sessions v ${ctx.joins}
    JOIN stream_gateways g ON g.id = c.gateway_id AND g.tenant_id = v.tenant_id
    WHERE v.session_token_hash = ? AND ${ctx.eligible} AND g.status != 'disabled'
      AND datetime(v.last_seen_at) > datetime('now','-90 seconds') LIMIT 1`).bind(hash).first<MediaSession>();
  return session && isOpen(await locationPolicy(env, session.tenant_id, session.location_id)) ? session : null;
}
const streamPath = (session: MediaSession) => `${session.tenant_id}/${session.camera_id}`;
export async function controlledSession(request: Request, env: MediaEnvironment, link: { id: string; tenant_id: string; location_id: string; camera_id: string; session_duration_minutes: number }, ctx: Context): Promise<Response> {
  if (!env.MEDIA_SIGNING_KEY || env.MEDIA_SIGNING_KEY.length < 32) return json({ ok: false, error: "MEDIA_NOT_CONFIGURED" }, 503);
  const policy = await locationPolicy(env, link.tenant_id, link.location_id);
  if (!isOpen(policy)) return denied();
  if (!Number.isInteger(link.session_duration_minutes) || link.session_duration_minutes < 5 || link.session_duration_minutes > 240) {
    return json({ ok: false, error: "INVALID_SESSION_CONFIGURATION" }, 503);
  }
  const token = crypto.randomUUID() + crypto.randomUUID();
  const hash = await ctx.sha256(token);
  const ip = request.headers.get("cf-connecting-ip");
  if (!ip && !import.meta.env.DEV) return denied();
  const ipHash = await ctx.sha256(`${env.MEDIA_SIGNING_KEY}:${ip ?? "local"}`);
  const expires = new Date(Date.now() + Math.min(link.session_duration_minutes, policy.session_minutes) * 60_000).toISOString();
  // Both limits are checked by the same SQLite statement that inserts the session; no count/insert race.
  const inserted = await env.ikurt_izle_db.prepare(`INSERT INTO viewer_sessions
    (id,tenant_id,location_id,camera_id,access_link_id,session_token_hash,status,expires_at,last_seen_at,ip_hash,user_agent)
    SELECT ?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,?,?
    WHERE (SELECT COUNT(*) FROM viewer_sessions v ${ctx.joins} WHERE v.tenant_id = ? AND v.location_id = ? AND ${ctx.eligible}
      AND datetime(v.last_seen_at) > datetime('now','-90 seconds')) < ?
    AND (SELECT COUNT(*) FROM viewer_sessions WHERE tenant_id = ? AND location_id = ? AND ip_hash = ? AND datetime(created_at) > datetime('now','-60 seconds')) < 30`)
    .bind(`ses_${crypto.randomUUID().replaceAll("-", "")}`, link.tenant_id, link.location_id, link.camera_id, link.id, hash,
      expires, ipHash, request.headers.get("user-agent")?.slice(0, 512) ?? null,
      link.tenant_id, link.location_id, policy.max_viewers, link.tenant_id, link.location_id, ipHash).run();
  if (!inserted.meta.changes) return json({ ok: false, error: "VIEWER_LIMIT", message: "İzleme kapasitesi veya kısa süreli istek sınırı doldu. Biraz sonra yeniden deneyin." }, 429);
  await env.ikurt_izle_db.prepare("UPDATE access_links SET scan_count=scan_count+1,last_accessed_at=CURRENT_TIMESTAMP WHERE id=?").bind(link.id).run();
  return json({ ok: true, token, expires_at: expires }, 201);
}
export async function mediaRequest(request: Request, env: MediaEnvironment, ctx: Context): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/internal/media/") && path !== "/api/public/media-ticket" &&
      !path.startsWith("/api/admin/stream-") && !(path.startsWith("/api/admin/gateways") && request.method !== "GET")) return null;
  if (env.MEDIA_ENABLED !== "1") return json({ ok: false, error: "MEDIA_NOT_CONFIGURED", message: "Yayın altyapısı henüz etkinleştirilmedi." }, 503);

  if (path === "/api/public/media-ticket" && request.method === "POST") {
    if (!env.MEDIA_SIGNING_KEY || env.MEDIA_SIGNING_KEY.length < 32) return json({ ok: false, error: "MEDIA_NOT_CONFIGURED" }, 503);
    const token = request.headers.get("authorization")?.match(/^Bearer (.{32,256})$/)?.[1];
    if (!token) return denied(401);
    const session = await eligibleSession(env, await ctx.sha256(token), ctx);
    if (!session) return denied(401);
    let origin: string;
    try { origin = gatewayOrigin(session.public_base_url, env); }
    catch { return json({ ok: false, error: "MEDIA_NOT_CONFIGURED" }, 503); }
    if (![session.tenant_id, session.camera_id, session.gateway_id].every(id => identifier.test(id))) return denied();
    const expires = Math.min(Math.floor(Date.now() / 1000) + 90, Math.floor(Date.parse(session.expires_at) / 1000));
    const ticket = await new SignJWT({ sh: session.session_token_hash, tid: session.tenant_id, lid: session.location_id,
      cid: session.camera_id, gid: session.gateway_id, path: streamPath(session) })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer("ikurt-izle").setAudience("ikurt-media")
      .setSubject(session.id).setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime(expires).sign(key(env));
    return json({ ok: true, protocol: "hls", ticket, expires_at: new Date(expires * 1000).toISOString(),
      session_url: `${origin}/session`, playback_url: `${origin}/hls/${streamPath(session)}/index.m3u8` });
  }
  if (path.startsWith("/api/internal/media/")) {
    const gateway = gatewayAuthorized(request, env);
    if (!gateway) return denied();
    if (path === "/api/internal/media/authorize" && request.method === "POST") {
      try {
        const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        const { payload } = await jwtVerify(token, key(env), { algorithms: ["HS256"], issuer: "ikurt-izle", audience: "ikurt-media", requiredClaims: ["exp", "iat", "sub", "sh", "tid", "lid", "cid", "gid", "path"] });
        if (payload.gid !== gateway || typeof payload.sh !== "string") return denied();
        const session = await eligibleSession(env, payload.sh, ctx);
        if (!session || session.id !== payload.sub || session.gateway_id !== gateway || session.tenant_id !== payload.tid ||
            session.location_id !== payload.lid || session.camera_id !== payload.cid || streamPath(session) !== payload.path) return denied();
        return json({ ok: true, path: streamPath(session) });
      } catch { return denied(); }
    }
    if (path === "/api/internal/media/sources" && request.method === "GET") {
      // Service-to-service only. No source details are ever part of public ticket/session responses.
      const rows = await env.ikurt_izle_db.prepare(`SELECT c.id,c.tenant_id,c.source_type,c.source_host,c.source_port,c.channel_number,c.stream_profile,c.username_enc,c.password_enc
        FROM cameras c JOIN stream_gateways g ON g.id=c.gateway_id AND g.tenant_id=c.tenant_id
        JOIN tenants t ON t.id=c.tenant_id JOIN locations l ON l.id=c.location_id AND l.tenant_id=c.tenant_id
        WHERE c.gateway_id=? AND c.enabled=1 AND g.status!='disabled' AND t.status='active' AND l.status='active'`).bind(gateway).all();
      const sources = [];
      for (const row of rows.results) {
        if (!row.username_enc || !row.password_enc || !row.source_host) continue;
        sources.push({ path: `${row.tenant_id}/${row.id}`, protocol: row.source_type, host: row.source_host,
          port: row.source_port, channel: row.channel_number, profile: row.stream_profile,
          username: await ctx.decrypt(String(row.username_enc)), password: await ctx.decrypt(String(row.password_enc)) });
      }
      return json({ ok: true, sources });
    }
    return denied();
  }
  if (path === "/api/admin/stream-policies") {
    const location = url.searchParams.get("location_id") ?? "";
    if (!await env.ikurt_izle_db.prepare("SELECT id FROM locations WHERE id=? AND tenant_id=?").bind(location, ctx.tenant).first()) return denied(404);
    if (request.method === "GET") return json({ ok: true, policy: await locationPolicy(env, ctx.tenant, location) });
    if (request.method === "PUT") {
      const raw = await smallJson(request);
      if (!raw) return json({ ok: false, message: "Geçersiz yayın politikası." }, 400);
      const body = raw as unknown as Policy;
      let hoursValid = body.weekly_hours === null;
      try { hoursValid ||= typeof body.weekly_hours === "string" && validHours(JSON.parse(body.weekly_hours)); } catch { /* invalid JSON */ }
      let validZone = true;
      try { new Intl.DateTimeFormat("en", { timeZone: body.timezone }); } catch { validZone = false; }
      if (!Number.isInteger(body.session_minutes) || body.session_minutes < 5 || body.session_minutes > 240 ||
          !Number.isInteger(body.max_viewers) || body.max_viewers < 1 || body.max_viewers > 500 || !validZone || typeof body.timezone !== "string" ||
          !hoursValid) return json({ ok: false, message: "Geçersiz yayın politikası." }, 400);
      await env.ikurt_izle_db.prepare(`INSERT INTO stream_policies(location_id,tenant_id,session_minutes,max_viewers,timezone,weekly_hours) VALUES(?,?,?,?,?,?)
        ON CONFLICT(location_id) DO UPDATE SET session_minutes=excluded.session_minutes,max_viewers=excluded.max_viewers,timezone=excluded.timezone,weekly_hours=excluded.weekly_hours,updated_at=CURRENT_TIMESTAMP`)
        .bind(location, ctx.tenant, body.session_minutes, body.max_viewers, body.timezone, body.weekly_hours).run();
      return json({ ok: true });
    }
  }
  if (path === "/api/admin/gateways" && request.method === "POST") {
    const raw = await smallJson(request);
    if (!raw) return denied(400);
    const body = raw as unknown as { id: string; name: string; public_base_url: string };
    if (!identifier.test(body.id) || typeof body.name !== "string" || body.name.length < 1 || body.name.length > 80) return denied(400);
    let origin: string;
    try { origin = gatewayOrigin(body.public_base_url, env); }
    catch { return json({ ok: false, message: "İzin verilen güvenli medya adresini girin." }, 400); }
    const inserted = await env.ikurt_izle_db.prepare("INSERT INTO stream_gateways(id,tenant_id,name,provider,public_base_url,status) VALUES(?,?,?,'mediamtx',?,'pending') ON CONFLICT(id) DO NOTHING").bind(body.id, ctx.tenant, body.name, origin).run();
    if (!inserted.meta.changes) return json({ ok: false, message: "Sunucu kimliği zaten kullanılıyor." }, 409);
    return json({ ok: true }, 201);
  }
  const probe = path.match(/^\/api\/admin\/stream-probe\/([a-zA-Z0-9_-]+)$/);
  if (probe && request.method === "POST") {
    const camera = await env.ikurt_izle_db.prepare(`SELECT c.id,c.tenant_id,c.gateway_id,g.public_base_url FROM cameras c
      JOIN stream_gateways g ON g.id=c.gateway_id AND g.tenant_id=c.tenant_id WHERE c.id=? AND c.tenant_id=?`).bind(probe[1], ctx.tenant).first<{ id: string; tenant_id: string; gateway_id: string; public_base_url: string }>();
    if (!camera) return denied(404);
    let ready = false;
    let reachable = false;
    try {
      const response = await fetch(gatewayOrigin(camera.public_base_url, env) + "/probe", { method: "POST", redirect: "error", signal: AbortSignal.timeout(8000),
        headers: { "content-type": "application/json", "x-ikurt-gateway-key": gatewaySecret(env, camera.gateway_id) }, body: JSON.stringify({ path: `${camera.tenant_id}/${camera.id}` }) });
      reachable = response.ok;
      ready = reachable && (await response.json() as { ready?: boolean }).ready === true;
    } catch { /* Never surface origin URLs, credentials or network exception messages. */ }
    await env.ikurt_izle_db.prepare("UPDATE cameras SET stream_status=?,last_online_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE last_online_at END,last_error=? WHERE id=? AND tenant_id=?")
      .bind(ready ? "online" : "offline", ready ? 1 : 0, ready ? null : "Yayın sunucusunda görüntü doğrulanamadı.", camera.id, ctx.tenant).run();
    await env.ikurt_izle_db.prepare("UPDATE stream_gateways SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status!='disabled'")
      .bind(reachable ? "online" : "offline", camera.gateway_id, ctx.tenant).run();
    return json({ ok: true, ready, message: ready ? "Gateway HLS playlist doğrulandı. Gerçek kamera türünü ayrıca kontrol edin." : "Gateway üzerinde yayın doğrulanamadı." });
  }
  return json({ ok: false, error: "NOT_FOUND" }, 404);
}
