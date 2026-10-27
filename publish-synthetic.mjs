import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
process.loadEnvFile(new URL("./.local/media.env", import.meta.url));
const executable = fileURLToPath(new URL("./.local/tools/ffmpeg/bin/ffmpeg.exe", import.meta.url));
const destination = new URL("rtsp://127.0.0.1:8554/ten_makaristan/cam_synthetic");
destination.username = "synthetic"; destination.password = process.env.MEDIA_PUBLISH_KEY;
const child = spawn(executable, ["-hide_banner", "-loglevel", "error", "-re", "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=15",
  "-an", "-c:v", "libx264", "-profile:v", "baseline", "-pix_fmt", "yuv420p", "-tune", "zerolatency", "-g", "15",
  "-b:v", "400k", "-maxrate", "500k", "-bufsize", "1M", "-rtsp_transport", "tcp", "-f", "rtsp", destination.href],
{ stdio: "ignore", windowsHide: true }); // FFmpeg errors may contain URLs; never forward raw output.
child.on("spawn", () => console.log("Sessiz 640×360 / H.264 sentetik renkli test yayını başlatıldı."));
child.on("error", () => { console.error("FFmpeg başlatılamadı. Install-Tools.ps1 çalıştırın."); process.exitCode = 1; });
child.on("exit", code => { if (code) console.error("Sentetik yayın durdu. Gateway ve MediaMTX pencerelerini kontrol edin."); });
process.once("SIGINT", () => child.kill());
process.once("exit", () => child.kill());
