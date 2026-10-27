import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTVerifyGetKey } from "jose";

interface Env {
  IZLE_LINKS: KVNamespace;
  ikurt_izle_db: D1Database;
  CAMERA_CREDENTIAL_KEY: string;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
  ADMIN_HOST?: string;
}

const TENANT_ID = "ten_makaristan";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
    },
  });
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function createCode(length = 14): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function bytesToBase64(value: Uint8Array): string {
  return btoa(Array.from(value, byte => String.fromCharCode(byte)).join(""));
}
async function getCredentialKey(secret: string): Promise<CryptoKey> {
  try {
    const raw = base64ToBytes(secret);
    if (raw.byteLength !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    throw new HttpError(503, "Credential şifreleme anahtarı yapılandırılmamış veya geçersiz.");
  }
}
export async function encryptCredential(value: string, secret: string): Promise<string> {
  const key = await getCredentialKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return ["v1", bytesToBase64(iv), bytesToBase64(new Uint8Array(encrypted))].join(".");
}
export async function decryptCredential(value: string, secret: string): Promise<string> {
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") throw new Error("Invalid credential format");
  const iv = base64ToBytes(parts[1]);
  const cipher = base64ToBytes(parts[2]);
  if (iv.length !== 12 || cipher.length < 16) throw new Error("Invalid credential format");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, await getCredentialKey(secret), cipher);
  return new TextDecoder().decode(clear);
}
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

// Shared eligibility for validation, heartbeat and admin counts. Never expose tokens or sources.
const sessionJoins = `
  JOIN cameras c ON c.id = v.camera_id AND c.tenant_id = v.tenant_id AND c.location_id = v.location_id
  JOIN locations l ON l.id = v.location_id AND l.tenant_id = v.tenant_id
  JOIN tenants t ON t.id = v.tenant_id
  JOIN access_links a ON a.id = v.access_link_id AND a.tenant_id = v.tenant_id
    AND a.camera_id = v.camera_id AND a.location_id = v.location_id
`;
const sessionEligible = `v.status = 'active' AND datetime(v.expires_at) > datetime('now')
  AND t.status = 'active' AND l.status = 'active' AND c.enabled = 1
  AND a.status = 'active' AND (a.expires_at IS NULL OR datetime(a.expires_at) > datetime('now'))`;
const recentlySeen = "datetime(v.last_seen_at) > datetime('now', '-90 seconds')";

async function getBody<T>(request: Request): Promise<T> {
  try { return (await request.json()) as T; }
  catch { throw new HttpError(400, "Geçersiz JSON isteği."); }
}

const accessKeys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function accessConfigured(env: Env): boolean {
  return Boolean(env.ACCESS_TEAM_DOMAIN && /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)
    && env.ACCESS_AUD && env.ADMIN_EMAIL && env.ADMIN_HOST);
}
export async function verifyAdminToken(token: string, env: Env, testKey?: JWTVerifyGetKey): Promise<string> {
  if (!accessConfigured(env)) throw new Error("Access not configured");
  const issuer = "https://" + env.ACCESS_TEAM_DOMAIN;
  let keys = accessKeys.get(issuer);
  if (!keys && !testKey) {
    keys = createRemoteJWKSet(new URL(issuer + "/cdn-cgi/access/certs"), { timeoutDuration: 5000 });
    accessKeys.set(issuer, keys);
  }
  const { payload } = await jwtVerify(token, testKey ?? keys!, {
    issuer, audience: env.ACCESS_AUD, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "email"],
  });
  if (payload.type !== "app" || typeof payload.email !== "string" || payload.email.toLowerCase() !== env.ADMIN_EMAIL!.toLowerCase()) throw new Error("Admin not allowed");
  return payload.email;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      const adminApi = path === "/api/admin" || path.startsWith("/api/admin/");
      const adminPage = path === "/admin" || path.startsWith("/admin/");
      if (adminApi || adminPage) {
        const localDevelopment = import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (!localDevelopment) {
          if (!accessConfigured(env) || url.hostname !== env.ADMIN_HOST) {
            return json({ ok: false, error: "ADMIN_AUTH_REQUIRED", message: "Admin kimlik doğrulaması yapılandırılmalıdır." }, 403);
          }
          const token = request.headers.get("Cf-Access-Jwt-Assertion");
          try {
            if (!token) throw new Error("Missing token");
            await verifyAdminToken(token, env);
          } catch {
            return json({ ok: false, error: "ADMIN_AUTH_REQUIRED", message: "Yönetici oturumu geçersiz veya süresi dolmuş. Admin sayfasından yeniden giriş yapın." }, 403);
          }
        }
        // JSON-only state changes plus exact Origin and Fetch Metadata prevent cookie-based CSRF.
        if (!["GET", "HEAD"].includes(method)) {
          const origin = request.headers.get("origin");
          const site = request.headers.get("sec-fetch-site");
          if ((origin && origin !== url.origin) || (site && !["same-origin", "none"].includes(site))) return json({ ok: false, error: "INVALID_ORIGIN" }, 403);
          if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ ok: false, error: "JSON_REQUIRED" }, 415);
        }
        if (adminPage) return env.ASSETS.fetch(request);
      }
      // =====================================================
      // HEALTH
      // =====================================================

      if (path === "/api/health" && method === "GET") {
        const result = await env.ikurt_izle_db
          .prepare("SELECT 1 AS ok")
          .first<{ ok: number }>();

        return json({
          ok: true,
          service: "ikurt-izle",
          database: result?.ok === 1 ? "connected" : "error",
          timestamp: new Date().toISOString(),
        });
      }

      // =====================================================
      // DASHBOARD
      // =====================================================

      if (path === "/api/admin/dashboard" && method === "GET") {
        const tenant = await env.ikurt_izle_db
          .prepare(`
            SELECT id, name, slug, status, logo_url,
                   primary_color, secondary_color
            FROM tenants
            WHERE id = ?
            LIMIT 1
          `)
          .bind(TENANT_ID)
          .first();

        const stats = await env.ikurt_izle_db
          .prepare(`
            SELECT
              (
                SELECT COUNT(*)
                FROM locations
                WHERE tenant_id = ?
                  AND status = 'active'
              ) AS locations,

              (
                SELECT COUNT(*)
                FROM cameras
                WHERE tenant_id = ?
                  AND enabled = 1
              ) AS cameras,

              (
                SELECT COUNT(*)
                FROM cameras
                WHERE tenant_id = ?
                  AND enabled = 1
                  AND stream_status = 'online'
              ) AS online_cameras,

              (
                SELECT COUNT(*)
                FROM viewer_sessions v ${sessionJoins}
                WHERE v.tenant_id = ? AND ${sessionEligible} AND ${recentlySeen}
              ) AS active_viewers
          `)
          .bind(TENANT_ID, TENANT_ID, TENANT_ID, TENANT_ID)
          .first();

        const locations = await env.ikurt_izle_db
          .prepare(`
            SELECT
              l.id,
              l.name,
              l.slug,
              l.city,
              l.district,
              l.status,
              COUNT(c.id) AS camera_count
            FROM locations l
            LEFT JOIN cameras c
              ON c.location_id = l.id
              AND c.enabled = 1
            WHERE l.tenant_id = ?
            GROUP BY l.id
            ORDER BY l.created_at ASC
          `)
          .bind(TENANT_ID)
          .all();

        const cameras = await env.ikurt_izle_db
          .prepare(`
            SELECT
              c.id,
              c.name,
              c.slug,
              c.manufacturer,
              c.model,
              c.source_type,
              c.stream_status,
              c.enabled,
              l.name AS location_name
            FROM cameras c
            JOIN locations l
              ON l.id = c.location_id
            WHERE c.tenant_id = ?
            ORDER BY c.created_at ASC
          `)
          .bind(TENANT_ID)
          .all();

        return json({
          ok: true,
          tenant,
          stats,
          locations: locations.results,
          cameras: cameras.results,
        });
      }

      // =====================================================
      // LOCATIONS - LIST
      // =====================================================

      if (path === "/api/admin/locations" && method === "GET") {
        const result = await env.ikurt_izle_db
          .prepare(`
            SELECT
              l.*,
              COUNT(c.id) AS camera_count
            FROM locations l
            LEFT JOIN cameras c
              ON c.location_id = l.id
            WHERE l.tenant_id = ?
            GROUP BY l.id
            ORDER BY l.name ASC
          `)
          .bind(TENANT_ID)
          .all();

        return json({
          ok: true,
          locations: result.results,
        });
      }

      // =====================================================
      // LOCATIONS - CREATE
      // =====================================================

      if (path === "/api/admin/locations" && method === "POST") {
        const body = await getBody<{
          name: string;
          slug: string;
          city?: string;
          district?: string;
          address?: string;
        }>(request);

        if (!body.name?.trim() || !body.slug?.trim()) {
          return json(
            {
              ok: false,
              error: "NAME_AND_SLUG_REQUIRED",
            },
            400,
          );
        }

        const id = createId("loc");

        await env.ikurt_izle_db
          .prepare(`
            INSERT INTO locations (
              id,
              tenant_id,
              name,
              slug,
              city,
              district,
              address,
              status
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
          `)
          .bind(
            id,
            TENANT_ID,
            body.name.trim(),
            body.slug.trim(),
            body.city?.trim() || null,
            body.district?.trim() || null,
            body.address?.trim() || null,
          )
          .run();

        return json(
          {
            ok: true,
            id,
          },
          201,
        );
      }

      // =====================================================
      // LOCATIONS - UPDATE
      // =====================================================

      const locationMatch = path.match(
        /^\/api\/admin\/locations\/([^/]+)$/,
      );

      if (locationMatch && method === "DELETE") {
        const body = await getBody<{ confirmation_name?: unknown }>(request);
        if (typeof body?.confirmation_name !== "string" || !body.confirmation_name) {
          throw new HttpError(400, "Silmek için işletmenin adını eksiksiz yazın.");
        }
        // A single conditional statement: confirmation and tenant scope cannot race with a rename.
        // D1's verified ON DELETE CASCADE removes cameras, access links and viewer sessions atomically.
        const result = await env.ikurt_izle_db.prepare(
          "DELETE FROM locations WHERE id = ? AND tenant_id = ? AND name = ?"
        ).bind(locationMatch[1], TENANT_ID, body.confirmation_name).run();
        if (!result.meta.changes) throw new HttpError(409, "İşletme adı eşleşmedi veya kayıt artık mevcut değil. Listeyi yenileyin.");
        return json({ ok: true, id: locationMatch[1] });
      }

      if (locationMatch && method === "PATCH") {
        const id = locationMatch[1];

        const body = await getBody<{
          name?: string;
          city?: string;
          district?: string;
          address?: string;
          status?: "active" | "inactive";
        }>(request);

        await env.ikurt_izle_db
          .prepare(`
            UPDATE locations
            SET
              name = COALESCE(?, name),
              city = COALESCE(?, city),
              district = COALESCE(?, district),
              address = COALESCE(?, address),
              status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND tenant_id = ?
          `)
          .bind(
            body.name ?? null,
            body.city ?? null,
            body.district ?? null,
            body.address ?? null,
            body.status ?? null,
            id,
            TENANT_ID,
          )
          .run();

        return json({ ok: true });
      }

      // =====================================================
      // CAMERAS - LIST
      // =====================================================

      if (path === "/api/admin/cameras" && method === "GET") {
        const result = await env.ikurt_izle_db
          .prepare(`
            SELECT
              c.id,
              c.name,
              c.slug,
              c.manufacturer,
              c.model,
              c.connection_mode,
              c.recorder_model,
              CASE WHEN c.username_enc IS NOT NULL AND c.password_enc IS NOT NULL THEN 1 ELSE 0 END AS has_credentials,
              c.source_type,
              c.source_host,
              c.source_port,
              c.channel_number,
              c.stream_profile,
              c.audio_enabled,
              c.recording_enabled,
              c.stream_status,
              c.enabled,
              c.last_online_at,
              c.last_error,
              l.id AS location_id,
              l.name AS location_name
            FROM cameras c
            JOIN locations l
              ON l.id = c.location_id
            WHERE c.tenant_id = ?
            ORDER BY l.name, c.name
          `)
          .bind(TENANT_ID)
          .all();

        return json({
          ok: true,
          cameras: result.results.map(row => ({ ...row, has_credentials: Boolean(row.has_credentials) })),
        });
      }

      // Camera configuration validation does not connect to a private LAN or test RTSP.
      const cameraTestMatch = path.match(/^\/api\/admin\/cameras\/([^/]+)\/test$/);
      if (cameraTestMatch && method === "POST") {
        const camera = await env.ikurt_izle_db.prepare(`SELECT connection_mode, source_type, source_host,
          source_port, channel_number, stream_profile,
          username_enc IS NOT NULL AS has_username, password_enc IS NOT NULL AS has_password
          FROM cameras WHERE id = ? AND tenant_id = ?`).bind(cameraTestMatch[1], TENANT_ID).first();
        if (!camera) throw new HttpError(404, "Kamera bulunamadı.");
        const missing: string[] = [];
        if (!camera.source_host) missing.push("Host / IP");
        if (!Number.isInteger(camera.source_port) || Number(camera.source_port) < 1 || Number(camera.source_port) > 65535) missing.push("RTSP port");
        if (!camera.has_username) missing.push("Kullanıcı adı");
        if (!camera.has_password) missing.push("Şifre");
        if (!["nvr", "ip_camera"].includes(String(camera.connection_mode))) missing.push("Bağlantı kaynağı");
        if (camera.connection_mode === "nvr" && (!Number.isInteger(camera.channel_number) || Number(camera.channel_number) < 1)) missing.push("NVR kanal numarası");
        if (!["rtsp", "rtsps"].includes(String(camera.source_type))) missing.push("Protokol (RTSP / RTSPS)");
        if (!["main", "sub"].includes(String(camera.stream_profile))) missing.push("Stream (Main / Sub)");
        return json({ ok: true, status: missing.length ? "CONFIGURATION_INCOMPLETE" : "READY_FOR_GATEWAY", missing,
          message: missing.length ? "Kamera yapılandırması eksik. Gerçek RTSP bağlantısı test edilmedi." : "Kamera yapılandırması tamam. Gerçek RTSP bağlantı testi MediaMTX gateway üzerinden yapılacaktır." });
      }

      const cameraAdminMatch = path.match(/^\/api\/admin\/cameras\/([^/]+)$/);
      if ((path === "/api/admin/cameras" && method === "POST") || (cameraAdminMatch && method === "PATCH")) {
        const creating = method === "POST";
        const id = creating ? createId("cam") : cameraAdminMatch![1];
        const body = await getBody<Record<string, unknown>>(request);
        if (!body || Array.isArray(body) || typeof body !== "object") throw new HttpError(400, "Geçersiz kamera bilgileri.");
        const existing = creating ? null : await env.ikurt_izle_db.prepare(
          "SELECT id, location_id, username_enc, password_enc FROM cameras WHERE id = ? AND tenant_id = ?"
        ).bind(id, TENANT_ID).first<{ id: string; location_id: string; username_enc: string | null; password_enc: string | null }>();
        if (!creating && !existing) throw new HttpError(404, "Kamera bulunamadı.");
        const values: Record<string, string | number | null> = {};
        const texts = ["location_id", "name", "manufacturer", "model", "connection_mode", "recorder_model", "source_type", "source_host", "stream_profile"];
        if (creating) texts.push("slug");
        for (const field of texts) {
          if (body[field] === undefined) continue;
          if (body[field] !== null && typeof body[field] !== "string") throw new HttpError(400, "Geçersiz alan: " + field);
          const value = typeof body[field] === "string" ? body[field].trim() : "";
          if (value.length > 255) throw new HttpError(400, "Alan çok uzun: " + field);
          if (["name", "location_id", "slug"].includes(field) && !value) throw new HttpError(400, "Zorunlu alan: " + field);
          values[field] = value || null;
        }
        if (creating && (!values.location_id || !values.name || !values.slug)) throw new HttpError(400, "Şube, kamera adı ve slug gerekli.");
        for (const [field, options] of Object.entries({ connection_mode: ["nvr", "ip_camera"], source_type: ["rtsp", "rtsps"], stream_profile: ["main", "sub"] })) {
          if (values[field] !== undefined && !options.includes(String(values[field]))) throw new HttpError(400, "Geçersiz alan: " + field);
        }
        if (values.source_host && !/^[a-zA-Z0-9.:[\]_-]+$/.test(String(values.source_host))) throw new HttpError(400, "Host alanına yalnızca IP veya hostname girin; URL ya da credential girmeyin.");
        for (const field of ["source_port", "channel_number"]) {
          if (body[field] === undefined) continue;
          const value = body[field];
          if (value !== null && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > (field === "source_port" ? 65535 : 2147483647))) throw new HttpError(400, "Geçersiz alan: " + field);
          values[field] = value as number | null;
        }
        for (const field of ["audio_enabled", "recording_enabled", "enabled"]) {
          if (body[field] === undefined) continue;
          if (typeof body[field] !== "boolean") throw new HttpError(400, "Geçersiz alan: " + field);
          values[field] = body[field] ? 1 : 0;
        }
        if (values.location_id) {
          const location = await env.ikurt_izle_db.prepare("SELECT id FROM locations WHERE id = ? AND tenant_id = ?").bind(values.location_id, TENANT_ID).first();
          if (!location) throw new HttpError(400, "Şube bulunamadı.");
        }
        let changedCredentials = false;
        for (const field of ["username", "password"] as const) {
          const value = body[field];
          if (value === undefined || value === "" || value === null) continue;
          if (typeof value !== "string" || value.length > 1024 || !value.trim()) throw new HttpError(400, "Geçersiz credential alanı.");
          const old = existing?.[field === "username" ? "username_enc" : "password_enc"];
          if (old && await decryptCredential(old, env.CAMERA_CREDENTIAL_KEY) === value) continue;
          values[field + "_enc"] = await encryptCredential(value, env.CAMERA_CREDENTIAL_KEY);
          changedCredentials = true;
        }
        if (changedCredentials) values.credentials_updated_at = new Date().toISOString();
        if (creating) {
          const row = { source_type: "rtsp", stream_profile: "sub", connection_mode: "nvr", ...values, id, tenant_id: TENANT_ID };
          const keys = Object.keys(row);
          await env.ikurt_izle_db.prepare("INSERT INTO cameras (" + keys.join(",") + ") VALUES (" + keys.map(() => "?").join(",") + ")").bind(...Object.values(row)).run();
        } else if (Object.keys(values).length) {
          // Moving a camera invalidates old sessions; existing QR links follow its new location atomically.
          const statements = [env.ikurt_izle_db.prepare("UPDATE cameras SET " + Object.keys(values).map(key => key + " = ?").join(",") + ", updated_at = CURRENT_TIMESTAMP WHERE id = ? AND tenant_id = ?").bind(...Object.values(values), id, TENANT_ID)];
          if (values.location_id && values.location_id !== existing!.location_id) {
            statements.push(env.ikurt_izle_db.prepare("UPDATE access_links SET location_id = ?, updated_at = CURRENT_TIMESTAMP WHERE camera_id = ? AND tenant_id = ?").bind(values.location_id, id, TENANT_ID));
            statements.push(env.ikurt_izle_db.prepare("UPDATE viewer_sessions SET status = 'revoked' WHERE camera_id = ? AND tenant_id = ?").bind(id, TENANT_ID));
          }
          await env.ikurt_izle_db.batch(statements);
        }
        return json({ ok: true, id }, creating ? 201 : 200);
      }

      // =====================================================
      // ACCESS LINKS - LIST
      // =====================================================

      if (path === "/api/admin/access-links" && method === "GET") {
        const result = await env.ikurt_izle_db
          .prepare(`
            SELECT
              a.id,
              a.code,
              a.label,
              a.status,
              a.session_duration_minutes,
              a.scan_count,
              a.last_accessed_at,
              a.created_at,
              c.id AS camera_id,
              c.name AS camera_name,
              l.name AS location_name
            FROM access_links a
            JOIN cameras c
              ON c.id = a.camera_id
            JOIN locations l
              ON l.id = a.location_id
            WHERE a.tenant_id = ?
            ORDER BY a.created_at DESC
          `)
          .bind(TENANT_ID)
          .all();

        return json({
          ok: true,
          links: result.results,
        });
      }

      // =====================================================
      // ACCESS LINKS - CREATE
      // =====================================================

      if (path === "/api/admin/access-links" && method === "POST") {
        const body = await getBody<{
          camera_id: string;
          label?: string;
          session_duration_minutes?: number;
        }>(request);

        const camera = await env.ikurt_izle_db
          .prepare(`
            SELECT id, location_id
            FROM cameras
            WHERE id = ?
              AND tenant_id = ?
            LIMIT 1
          `)
          .bind(body.camera_id, TENANT_ID)
          .first<{
            id: string;
            location_id: string;
          }>();

        if (!camera) {
          return json(
            {
              ok: false,
              error: "CAMERA_NOT_FOUND",
            },
            404,
          );
        }

        const id = createId("link");
        const code = createCode();

        await env.ikurt_izle_db
          .prepare(`
            INSERT INTO access_links (
              id,
              tenant_id,
              location_id,
              camera_id,
              code,
              label,
              status,
              session_duration_minutes
            )
            VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
          `)
          .bind(
            id,
            TENANT_ID,
            camera.location_id,
            camera.id,
            code,
            body.label ?? "QR / NFC",
            body.session_duration_minutes ?? 30,
          )
          .run();

        return json(
          {
            ok: true,
            id,
            code,
            url: `/c/${code}`,
          },
          201,
        );
      }

      // =====================================================
      // ACCESS LINKS - STATUS
      // =====================================================

      const linkMatch = path.match(
        /^\/api\/admin\/access-links\/([^/]+)$/,
      );

      if (linkMatch && method === "PATCH") {
        const id = linkMatch[1];

        const body = await getBody<{
          status?: "active" | "disabled" | "revoked";
          session_duration_minutes?: number;
          label?: string;
        }>(request);

        await env.ikurt_izle_db
          .prepare(`
            UPDATE access_links
            SET
              status = COALESCE(?, status),
              session_duration_minutes =
                COALESCE(?, session_duration_minutes),
              label = COALESCE(?, label),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
              AND tenant_id = ?
          `)
          .bind(
            body.status ?? null,
            body.session_duration_minutes ?? null,
            body.label ?? null,
            id,
            TENANT_ID,
          )
          .run();

        return json({ ok: true });
      }

      // =====================================================
      // ACTIVE VIEWERS
      // =====================================================

      if (path === "/api/admin/viewers" && method === "GET") {
        const result = await env.ikurt_izle_db
          .prepare(`
            SELECT
              v.id,
              v.status,
              v.created_at,
              v.expires_at,
              v.last_seen_at,
              CASE WHEN ${sessionEligible} AND ${recentlySeen} THEN 1 ELSE 0 END AS is_active,
              c.name AS camera_name,
              l.name AS location_name,
              a.label AS access_label
            FROM viewer_sessions v ${sessionJoins}
            WHERE v.tenant_id = ?
            ORDER BY v.created_at DESC
            LIMIT 250
          `)
          .bind(TENANT_ID)
          .all();

        return json({
          ok: true,
          viewers: result.results,
        });
      }

      // =====================================================
      // STREAM GATEWAYS
      // =====================================================

      if (path === "/api/admin/gateways" && method === "GET") {
        const result = await env.ikurt_izle_db
          .prepare(`
            SELECT id, name, provider, status, region
            FROM stream_gateways
            ORDER BY created_at DESC
          `)
          .all();

        return json({
          ok: true,
          gateways: result.results,
        });
      }

      // =====================================================
      // TENANT SETTINGS
      // =====================================================

      if (path === "/api/admin/settings" && method === "GET") {
        const tenant = await env.ikurt_izle_db
          .prepare(`
            SELECT
              id,
              name,
              slug,
              logo_url,
              primary_color,
              secondary_color,
              status
            FROM tenants
            WHERE id = ?
          `)
          .bind(TENANT_ID)
          .first();

        return json({
          ok: true,
          tenant,
        });
      }

      if (path === "/api/admin/settings" && method === "PATCH") {
        const body = await getBody<{
          name?: string;
          logo_url?: string;
          primary_color?: string;
          secondary_color?: string;
        }>(request);

        await env.ikurt_izle_db
          .prepare(`
            UPDATE tenants
            SET
              name = COALESCE(?, name),
              logo_url = COALESCE(?, logo_url),
              primary_color = COALESCE(?, primary_color),
              secondary_color = COALESCE(?, secondary_color),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(
            body.name ?? null,
            body.logo_url ?? null,
            body.primary_color ?? null,
            body.secondary_color ?? null,
            TENANT_ID,
          )
          .run();

        return json({ ok: true });
      }

      // =====================================================
      // PUBLIC ACCESS LINK
      // =====================================================

      const accessCodeMatch = path.match(
        /^\/api\/public\/access\/([^/]+)$/,
      );

      if (accessCodeMatch && method === "GET") {
        const code = accessCodeMatch[1];

        const link = await env.ikurt_izle_db
          .prepare(`
            SELECT
              a.id AS access_link_id,
              a.code,
              a.status,
              a.session_duration_minutes,

              t.id AS tenant_id,
              t.name AS tenant_name,
              t.logo_url,

              l.id AS location_id,
              l.name AS location_name,

              c.id AS camera_id,
              c.name AS camera_name,
              c.stream_status,
              c.enabled

            FROM access_links a

            JOIN tenants t
              ON t.id = a.tenant_id

            JOIN locations l
              ON l.id = a.location_id

            JOIN cameras c
              ON c.id = a.camera_id

            WHERE a.code = ?
              AND a.status = 'active'
              AND (a.expires_at IS NULL OR datetime(a.expires_at) > datetime('now'))
              AND c.tenant_id = a.tenant_id AND l.tenant_id = a.tenant_id AND c.location_id = a.location_id
              AND t.status = 'active'
              AND l.status = 'active'
              AND c.enabled = 1

            LIMIT 1
          `)
          .bind(code)
          .first();

        if (!link) {
          return json(
            {
              ok: false,
              error: "ACCESS_LINK_NOT_FOUND",
            },
            404,
          );
        }

        return json({
          ok: true,
          access: link,
        });
      }

            // =====================================================
      // CREATE VIEWER SESSION
      // ŞİFRE YOK.
      // =====================================================

      const sessionMatch = path.match(
        /^\/api\/public\/access\/([^/]+)\/session$/,
      );

      if (sessionMatch && method === "POST") {
        const code = sessionMatch[1];

        const link = await env.ikurt_izle_db
          .prepare(`
            SELECT
              a.id,
              a.tenant_id,
              a.location_id,
              a.camera_id,
              a.session_duration_minutes

            FROM access_links a

            JOIN tenants t
              ON t.id = a.tenant_id

            JOIN locations l
              ON l.id = a.location_id

            JOIN cameras c
              ON c.id = a.camera_id

            WHERE a.code = ?
              AND a.status = 'active'
              AND (a.expires_at IS NULL OR datetime(a.expires_at) > datetime('now'))
              AND c.tenant_id = a.tenant_id AND l.tenant_id = a.tenant_id AND c.location_id = a.location_id
              AND t.status = 'active'
              AND l.status = 'active'
              AND c.enabled = 1

            LIMIT 1
          `)
          .bind(code)
          .first<{
            id: string;
            tenant_id: string;
            location_id: string;
            camera_id: string;
            session_duration_minutes: number;
          }>();

        if (!link) {
          return json(
            {
              ok: false,
              error: "ACCESS_DENIED",
            },
            403,
          );
        }

        const sessionId = createId("ses");

        const rawToken =
          crypto.randomUUID() +
          crypto.randomUUID();

        const tokenHash = await sha256(rawToken);

        const minutes = Math.max(
          5,
          Math.min(
            link.session_duration_minutes,
            240,
          ),
        );

        const expiresAt = new Date(
          Date.now() + minutes * 60_000,
        ).toISOString();

        await env.ikurt_izle_db
          .prepare(`
            INSERT INTO viewer_sessions (
              id,
              tenant_id,
              location_id,
              camera_id,
              access_link_id,
              session_token_hash,
              status,
              created_at,
              expires_at,
              last_seen_at,
              user_agent
            )
            VALUES (
              ?, ?, ?, ?, ?, ?,
              'active',
              CURRENT_TIMESTAMP,
              ?,
              CURRENT_TIMESTAMP,
              ?
            )
          `)
          .bind(
            sessionId,
            link.tenant_id,
            link.location_id,
            link.camera_id,
            link.id,
            tokenHash,
            expiresAt,
            request.headers.get("user-agent"),
          )
          .run();

        await env.ikurt_izle_db
          .prepare(`
            UPDATE access_links
            SET
              scan_count = scan_count + 1,
              last_accessed_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(link.id)
          .run();

        return json(
          {
            ok: true,
            token: rawToken,
            expires_at: expiresAt,
          },
          201,
        );
      }

      // =====================================================
      // SESSION VALIDATION
      // =====================================================

      if ((path === "/api/public/session" && method === "GET") || (path === "/api/public/session/heartbeat" && method === "POST")) {
        const authorization =
          request.headers.get("authorization");

        if (!authorization?.startsWith("Bearer ")) {
          return json(
            {
              ok: false,
              error: "SESSION_REQUIRED",
            },
            401,
          );
        }

        const token =
          authorization.substring("Bearer ".length);

        const tokenHash = await sha256(token);

        const session = await env.ikurt_izle_db
          .prepare(`
            SELECT
              v.id,
              v.expires_at,
              v.status,

              c.id AS camera_id,
              c.name AS camera_name,
              c.stream_status,

              l.name AS location_name,

              t.name AS tenant_name,
              t.logo_url

            FROM viewer_sessions v ${sessionJoins}
            WHERE v.session_token_hash = ? AND ${sessionEligible}

            LIMIT 1
          `)
          .bind(tokenHash)
          .first();

        if (!session) {
          return json(
            {
              ok: false,
              error: "SESSION_EXPIRED",
            },
            401,
          );
        }

        if (method === "POST") {
          const updated = await env.ikurt_izle_db.prepare(`UPDATE viewer_sessions SET last_seen_at = CURRENT_TIMESTAMP
            WHERE id IN (SELECT v.id FROM viewer_sessions v ${sessionJoins}
              WHERE v.session_token_hash = ? AND ${sessionEligible})`).bind(tokenHash).run();
          if (!updated.meta.changes) return json({ ok: false, error: "SESSION_EXPIRED" }, 401);
        }

        return json({
          ok: true,
          session,
        });
      }

      return json(
        {
          ok: false,
          error: "NOT_FOUND",
        },
        404,
      );
    } catch (error) {
      if (error instanceof HttpError) return json({ ok: false, error: "REQUEST_FAILED", message: error.message }, error.status);
      // Never return or log database errors, bound credentials, ciphertext or request bodies.
      return json({ ok: false, error: "INTERNAL_SERVER_ERROR", message: "İşlem tamamlanamadı. Yapılandırmayı kontrol edip tekrar deneyin." }, 500);
    }
  },
};
