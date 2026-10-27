// Explicit service-to-service pull. No NVR connection until the generated config is deliberately started.
import { readFile, writeFile } from "node:fs/promises";
if (!process.argv.includes("--confirmed")) throw new Error("Önce işletme onayını ve izleme yetkilerini doğrulayın; ardından --confirmed kullanın.");
process.loadEnvFile(new URL("./.local/media.env", import.meta.url));
const app = new URL(process.env.APP_ORIGIN);
if (app.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(app.hostname)) throw new Error("HTTPS gerekli");
try {
  const response = await fetch(new URL("/api/internal/media/sources", app), { redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { "x-ikurt-gateway-id": process.env.GATEWAY_ID, "x-ikurt-gateway-key": process.env.GATEWAY_KEY } });
  if (!response.ok) throw new Error("Source unavailable");
  const { sources } = await response.json();
  const paths = {};
  for (const source of sources) {
    if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(source.path) || !["rtsp", "rtsps"].includes(source.protocol) ||
        !Number.isInteger(source.port) || source.port < 1 || source.port > 65535 || !Number.isInteger(source.channel) || source.channel < 1) throw new Error("Source invalid");
    const url = new URL(source.protocol + "://placeholder");
    url.hostname = source.host; url.port = String(source.port); url.pathname = "/cam/realmonitor";
    url.searchParams.set("channel", String(source.channel)); url.searchParams.set("subtype", source.profile === "main" ? "0" : "1");
    url.username = source.username; url.password = source.password;
    paths["private/" + source.path] = { source: url.href, sourceOnDemand: true, rtspTransport: "tcp", record: false };
    paths[source.path] = { source: "publisher", overridePublisher: false, record: false };
  }
  // JSON is valid YAML; known-safe base settings are copied without third-party YAML parsing.
  const base = JSON.parse(await readFile(new URL("./mediamtx-base.json", import.meta.url), "utf8"));
  await writeFile(new URL("./.local/cameras.yml", import.meta.url), JSON.stringify({ ...base, paths }, null, 2), { mode: 0o600 });
  await writeFile(new URL("./.local/filter-paths.json", import.meta.url), JSON.stringify(sources.map(source => source.path)), { mode: 0o600 });
  console.log("Yetkili kaynak yapılandırması özel yerel klasöre yazıldı. NVR'a henüz bağlantı kurulmadı.");
} catch { console.error("Kaynak eşitleme tamamlanamadı. Ayrıntılar gizli bağlantı bilgilerini korumak için yazdırılmadı."); process.exitCode = 1; }
