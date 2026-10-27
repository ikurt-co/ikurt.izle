const fs=require('node:fs');
let s=fs.readFileSync('worker/index.ts','utf8').replaceAll('\r\n','\n');
s='import { createRemoteJWKSet, jwtVerify } from "jose";\nimport type { JWTVerifyGetKey } from "jose";\n\n'+s;
s=s.replace('  CAMERA_CREDENTIAL_KEY: string;','  CAMERA_CREDENTIAL_KEY: string;\n  ASSETS: Fetcher;\n  ACCESS_TEAM_DOMAIN?: string;\n  ACCESS_AUD?: string;\n  ADMIN_EMAIL?: string;\n  ADMIN_HOST?: string;');
const pos=s.indexOf('export default {');
s=s.slice(0,pos)+`const accessKeys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function accessConfigured(env: Env): boolean {
  return Boolean(env.ACCESS_TEAM_DOMAIN && /^[a-z0-9-]+\\.cloudflareaccess\\.com$/.test(env.ACCESS_TEAM_DOMAIN)
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

`+s.slice(pos);
const a=s.indexOf('      if (path.startsWith("/api/admin/")) {');const b=s.indexOf('      // =====================================================',a);
s=s.slice(0,a)+`      const adminApi = path === "/api/admin" || path.startsWith("/api/admin/");
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
`+s.slice(b);
fs.writeFileSync('worker/index.ts',s);
let config=fs.readFileSync('wrangler.jsonc','utf8');config=config.replace('"assets": {','"assets": {\n  "binding": "ASSETS",').replace('"/api/*"','"/api/*", "/admin", "/admin/*"');fs.writeFileSync('wrangler.jsonc',config);
let tests=fs.readFileSync('tests/worker.test.mjs','utf8');tests=tests.replace("source.replaceAll('import.meta.env.DEV', String(dev))","source.replaceAll('import.meta.env.DEV', String(dev)).replaceAll('from \"jose\"', 'from ' + JSON.stringify(import.meta.resolve('jose')))");tests=tests.replace("method: 'POST', body: '{'","method: 'POST', headers: { 'content-type': 'application/json' }, body: '{'");fs.writeFileSync('tests/worker.test.mjs',tests);
