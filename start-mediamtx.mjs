import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const executable = fileURLToPath(new URL("./.local/tools/mediamtx/mediamtx.exe", import.meta.url));
const config = fileURLToPath(new URL(process.argv.includes("--camera-config") ? "./.local/cameras.yml" : "./mediamtx.yml", import.meta.url));
const child = spawn(executable, [config], { stdio: "ignore", windowsHide: true, cwd: fileURLToPath(new URL("./.local/", import.meta.url)) }); // Keep generated TLS material private too.
child.on("spawn", () => console.log("MediaMTX başlatıldı; yönetim, kayıt, ses depolama ve WebRTC kapalı."));
child.on("error", () => { console.error("MediaMTX başlatılamadı. Kurulum dosyasını kontrol edin."); process.exitCode = 1; });
child.on("exit", code => { if (code) console.error("MediaMTX durdu. Yerel yapılandırmayı ve kullanılan portları kontrol edin."); });
process.once("SIGINT", () => child.kill());
process.once("exit", () => child.kill());
