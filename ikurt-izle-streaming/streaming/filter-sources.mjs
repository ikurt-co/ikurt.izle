// Supervised video-only relay. FFmpeg sees loopback credentials, never NVR credentials.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
if (!process.argv.includes("--confirmed")) throw new Error("Operator approval and viewing permissions must be confirmed first.");
process.loadEnvFile(new URL("./.local/media.env", import.meta.url));
const paths = JSON.parse(await readFile(new URL("./.local/filter-paths.json", import.meta.url), "utf8"));
const children = new Set();
const stop = new AbortController();
function program(name, args, capture = false) {
  const child = spawn(fileURLToPath(new URL("./.local/tools/ffmpeg/bin/" + name + ".exe", import.meta.url)), args,
    { stdio: ["ignore", capture ? "pipe" : "ignore", "ignore"], windowsHide: true, ...(capture ? { timeout: 15000 } : {}) });
  children.add(child);
  let output = "";
  child.stdout?.on("data", chunk => { if (output.length < 16384) output += chunk; });
  return new Promise(resolve => {
    let settled = false;
    const done = code => { if (!settled) { settled = true; children.delete(child); resolve({ code, output }); } };
    child.on("exit", done); child.on("error", () => done(-1));
  });
}
async function supervise(path) {
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(path)) throw new Error("Invalid source path");
  const input = new URL("rtsp://127.0.0.1:8554/private/" + path);
  input.username = "bridge"; input.password = process.env.MEDIA_ORIGIN_KEY;
  const output = new URL("rtsp://127.0.0.1:8554/" + path);
  output.username = "publisher"; output.password = process.env.MEDIA_PUBLISH_KEY;
  let retry = 2000;
  while (!stop.signal.aborted) {
    try {
      const probe = await program("ffprobe", ["-v", "error", "-rtsp_transport", "tcp", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "json", input.href], true);
      if (probe.code === 0 && JSON.parse(probe.output || "{}").streams?.[0]?.codec_name === "h264" && !stop.signal.aborted) {
        await program("ffmpeg", ["-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-rw_timeout", "15000000", "-i", input.href,
          "-map", "0:v:0", "-an", "-c:v", "copy", "-rtsp_transport", "tcp", "-f", "rtsp", output.href]);
      }
    } catch { /* Credential-bearing exceptions are deliberately not logged. */ }
    if (stop.signal.aborted) break;
    console.log("Kaynak bekleniyor; yeniden baglanti denenecek. H.264 ve ag erisimini kontrol edin.");
    await delay(retry, undefined, { signal: stop.signal }).catch(() => {});
    retry = Math.min(30000, retry * 2);
  }
}
const shutdown = () => { stop.abort(); for (const child of children) child.kill(); };
process.once("SIGINT", shutdown); process.once("exit", shutdown);
await Promise.all(paths.map(supervise));
