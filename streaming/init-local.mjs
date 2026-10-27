import { mkdir, writeFile, access } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
const directory = new URL("./.local/", import.meta.url);
await mkdir(directory, { recursive: true });
const file = new URL("media.env", directory);
try { await access(file); console.log("Mevcut yerel yapılandırma korundu."); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  const secret = () => randomBytes(32).toString("base64url");
  const values = {
    MEDIA_ENABLED: "1", APP_ORIGIN: "http://localhost:5173", GATEWAY_ID: "gw_local",
    MEDIAMTX_ORIGIN: "http://127.0.0.1:8888", MEDIA_SIGNING_KEY: secret(),
    GATEWAY_KEY: secret(), MEDIA_ORIGIN_KEY: secret(), MEDIA_PUBLISH_KEY: secret(),
  };
  await writeFile(file, Object.entries(values).map(([name, value]) => name + "=" + value).join("\n") + "\n", { flag: "wx", mode: 0o600 });
  console.log("Sentetik test anahtarları oluşturuldu; içerikleri yazdırılmadı.");
}
console.log("Yapılandırma: " + fileURLToPath(file));
