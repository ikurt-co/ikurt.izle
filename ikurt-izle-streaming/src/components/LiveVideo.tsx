import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";

export type VideoStatus = "connecting" | "playing" | "waiting" | "blocked";
interface Ticket { ticket: string; session_url: string; playback_url: string }
export default function LiveVideo({ token, onStatus }: { token: string; onStatus: (status: VideoStatus) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [notice, setNotice] = useState("Yayın bağlantısı kuruluyor.");
  const [playRequired, setPlayRequired] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = video.current!;
    const controller = new AbortController();
    let player: Hls | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let source = "";
    const halt = () => { player?.destroy(); player = undefined; element.pause(); element.removeAttribute("src"); element.load(); };
    const fail = (blocked: boolean) => {
      if (stopped) return;
      halt();
      source = "";
      onStatus(blocked ? "blocked" : "waiting");
      setNotice(blocked ? "İzleme izni sona erdi veya yayın erişimi kapatıldı." : "Yayın şu anda alınamıyor. Bağlantı yeniden denenecek.");
      if (!blocked && !retry) retry = setTimeout(() => setAttempt(value => value + 1), Math.min(30, 5 * (attempt + 1)) * 1000);
    };
    const play = () => { element.muted = true; void element.play().catch(() => { if (!stopped) setPlayRequired(true); }); };
    async function refresh() {
      try {
        const grant = await fetch("/api/public/media-ticket", { method: "POST", headers: { Authorization: "Bearer " + token }, signal: controller.signal, redirect: "error" });
        if (!grant.ok) { fail(grant.status === 401 || grant.status === 403); return; }
        const ticket = await grant.json() as Ticket;
        if (stopped) return;
        const session = await fetch(ticket.session_url, { method: "POST", credentials: "include", redirect: "error",
          headers: { Authorization: "Bearer " + ticket.ticket }, signal: controller.signal });
        if (!session.ok) { fail(session.status === 401 || session.status === 403); return; }
        if (stopped || source === ticket.playback_url) return;
        source = ticket.playback_url;
        halt();
        if (element.canPlayType("application/vnd.apple.mpegurl")) { element.src = source; play(); }
        else {
          const { default: HlsPlayer } = await import("hls.js/light");
          if (stopped) return;
          if (!HlsPlayer.isSupported()) { setNotice("Bu tarayıcı canlı video biçimini desteklemiyor."); onStatus("blocked"); return; }
          player = new HlsPlayer({ debug: false, lowLatencyMode: false, backBufferLength: 0, maxBufferLength: 4,
            xhrSetup: xhr => { xhr.withCredentials = true; } });
          player.on(HlsPlayer.Events.MANIFEST_PARSED, play);
          player.on(HlsPlayer.Events.ERROR, (_event, data) => {
            const denied = data.response?.code === 401 || data.response?.code === 403;
            if (denied || data.fatal) fail(denied);
          });
          player.loadSource(source); player.attachMedia(element);
        }
      } catch {
        if (!controller.signal.aborted) fail(false);
      }
    }
    const playing = () => { if (!stopped) { onStatus("playing"); setNotice(""); setPlayRequired(false); } };
    const stalled = () => { if (!stopped) { onStatus("waiting"); setNotice("Görüntü bekleniyor."); } };
    const ended = () => fail(false);
    element.addEventListener("playing", playing);
    element.addEventListener("waiting", stalled);
    element.addEventListener("error", ended);
    const renew = setInterval(() => void refresh(), 45_000);
    onStatus("connecting");
    void refresh();
    return () => {
      stopped = true; controller.abort(); clearInterval(renew); clearTimeout(retry); halt();
      element.removeEventListener("playing", playing); element.removeEventListener("waiting", stalled); element.removeEventListener("error", ended);
    };
  }, [token, attempt, onStatus]);
  return <div className="live-video">
    <video ref={video} autoPlay muted playsInline crossOrigin="use-credentials" controls controlsList="nodownload" disablePictureInPicture aria-label="Canlı kamera görüntüsü" />
    {notice && <p className="live-video-notice" role="status">{notice}</p>}
    {playRequired && <button className="viewer-retry" type="button" onClick={() => { void video.current?.play().then(() => setPlayRequired(false)).catch(() => setPlayRequired(true)); }}>Görüntüyü başlat</button>}
  </div>;
}
