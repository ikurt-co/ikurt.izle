import { useEffect, useRef, useState } from "react";
import {
  RefreshCw,
  Expand,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { useParams } from "react-router-dom";

import { api } from "../lib/api";
import BrandLogo from "../components/BrandLogo";
import PlayfulSky from "../components/PlayfulSky";
import BrandFooter from "../components/BrandFooter";
import "./ViewerPage.css";

interface AccessData {
  access_link_id: string;
  code: string;
  status: string;
  session_duration_minutes: number;

  tenant_id: string;
  tenant_name: string;
  logo_url: string | null;

  location_id: string;
  location_name: string;

  camera_id: string;
  camera_name: string;
  stream_status: string;
  enabled: number;
}

interface AccessResponse {
  ok: boolean;
  access: AccessData;
}

interface CreateSessionResponse {
  ok: boolean;
  token: string;
  expires_at: string;
}

interface SessionData {
  id: string;
  expires_at: string;
  status: string;

  camera_id: string;
  camera_name: string;
  stream_status: string;

  location_name: string;

  tenant_name: string;
  logo_url: string | null;
}

interface SessionResponse {
  ok: boolean;
  session: SessionData;
}

export default function ViewerPage() {
  const { code } = useParams();
  return <ViewerSessionPage key={code} code={code} />;
}

function ViewerSessionPage({ code }: { code?: string }) {

  const videoRef = useRef<HTMLDivElement>(null);

  const [access, setAccess] =
    useState<AccessData | null>(null);

  const [session, setSession] =
    useState<SessionData | null>(null);

  const [token, setToken] =
    useState<string | null>(null);

  const [loading, setLoading] = useState(true);

  const [error, setError] =
    useState<string | null>(null);

  async function validateSession(
    sessionToken: string,
  ) {
    return api<SessionResponse>(
      "/api/public/session",
      {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      },
    );
  }

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    async function start() {
      try {


        const accessData =
          await api<AccessResponse>(
            `/api/public/access/${code}`,
          );

        if (cancelled) return;

        setAccess(accessData.access);

        const storageKey =
          `ikurt_viewer_session_${code}`;

        let currentToken =
          localStorage.getItem(storageKey);

        if (currentToken) {
          try {
            const existing =
              await validateSession(currentToken);

            if (cancelled) return;

            setToken(currentToken);
            setSession(existing.session);
            setLoading(false);
            return;
          } catch {
            localStorage.removeItem(storageKey);
            currentToken = null;
          }
        }

        const created =
          await api<CreateSessionResponse>(
            `/api/public/access/${code}/session`,
            {
              method: "POST",
            },
          );

        if (cancelled) return;

        localStorage.setItem(
          storageKey,
          created.token,
        );

        setToken(created.token);

        const validated =
          await validateSession(created.token);

        if (cancelled) return;

        setSession(validated.session);
      } catch {

        setError(
          "Bu bağlantı geçerli değil, devre dışı veya şu anda erişilemiyor.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void start();

    return () => {
      cancelled = true;
    };
  }, [code]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let inFlight = false;
    const controller = new AbortController();
    async function heartbeat() {
      if (document.visibilityState !== "visible" || inFlight || cancelled) return;
      inFlight = true;
      try {
        const result = await api<SessionResponse>("/api/public/session/heartbeat", {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        if (!cancelled) setSession(result.session);
      } catch {
        if (cancelled) return;
        if (code) localStorage.removeItem(`ikurt_viewer_session_${code}`);
        setToken(null); setSession(null);
        setError("İzleme oturumu doğrulanamadı. Sayfayı yenileyerek yeniden bağlanabilirsiniz.");
      } finally { inFlight = false; }
    }
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 30_000);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      cancelled = true; controller.abort(); window.clearInterval(timer);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, [token, code]);

  async function openFullscreen() {
    try {
      await videoRef.current?.requestFullscreen();
    } catch {
      // Mobil tarayıcı desteklemiyorsa sessizce devam et.
    }
  }

  const preparing = loading && Boolean(code);
  const unavailable = !preparing && Boolean(error || !access || !session);
  const identity = session ?? access;
  const tenantName = identity?.tenant_name ?? "Makaristan Malatya";
  const locationName = identity?.location_name ?? "Malatya";
  const businessName = tenantName.toLocaleLowerCase("tr-TR").includes(locationName.toLocaleLowerCase("tr-TR")) ? tenantName : `${tenantName} ${locationName}`;
  const cameraName = identity?.camera_name ?? "Çocuk Oyun Alanı";
  // Playback is not integrated yet. Never present camera metadata as live video.
  const streamUnavailable = session?.stream_status === "offline" || session?.stream_status === "error";
  const statusLabel = preparing ? "Bağlantı kuruluyor" : unavailable ? "Erişim sağlanamadı" : streamUnavailable ? "Yayın bekleniyor" : "Yayın hazırlanıyor";
  const title = preparing ? "İzleme alanınız hazırlanıyor" : unavailable ? "Şu anda yayına erişilemiyor" : streamUnavailable ? "Kamera şu anda yayın yapmıyor" : "Kamera bağlantısı bekleniyor";
  const description = preparing
    ? "Erişim bağlantınız kontrol ediliyor. Lütfen kısa bir süre bekleyin."
    : unavailable
      ? "Bağlantının süresi dolmuş veya erişim kapatılmış olabilir. Yeniden deneyebilir ya da restoran personelinden yardım isteyebilirsiniz."
      : "Canlı görüntü henüz hazır değil. Yayın hazır olduğunda oyun alanını bu ekrandan takip edebilirsiniz.";

  return (
    <main className="viewer-page">
      <PlayfulSky />
      <div className="viewer-container">
        <header className="viewer-header">
          <BrandLogo brand="makaristan" src={identity?.logo_url} name={tenantName} />
          <div className="viewer-business"><strong>{businessName}</strong><span>Aileler için izleme alanı</span></div>
        </header>
        <section className="viewer-title" aria-labelledby="viewer-heading">
          <span className="viewer-eyebrow">KÜÇÜK KEŞİFLER, KEYİFLİ ANLAR</span>
          <h1 id="viewer-heading">{cameraName}</h1>
          <p>Çocuğunuzun oyun alanındaki anlarını takip edin.</p>
        </section>
        <section className="video-shell" ref={videoRef} aria-label={`${cameraName} yayını`} aria-busy={preparing}>
          <div className="viewer-panel-heading">
            <span><Radio size={16} aria-hidden="true" /> Oyun alanı kamerası</span>
            <span className={`live-pill${unavailable ? " live-pill--unavailable" : ""}`}>{statusLabel}</span>
          </div>
          <div className="video-placeholder">
            <div className="viewer-state" role="status" aria-live="polite" aria-atomic="true">
              <span className="viewer-state-icon" aria-hidden="true">
                {preparing ? <span className="spinner" /> : <Radio size={24} />}
              </span>
              <h2>{title}</h2>
              <p>{description}</p>
              {unavailable && <button className="viewer-retry" type="button" onClick={() => window.location.reload()}>
                <RefreshCw size={16} aria-hidden="true" /> Yeniden dene
              </button>}
            </div>
          </div>
          <div className="viewer-panel-footer">
            <span>{preparing ? "Lütfen bekleyin" : unavailable ? "Personelimizden yardım alabilirsiniz" : "Görüntü bağlantısı bekleniyor"}</span>
            {!preparing && !unavailable && <button type="button" className="fullscreen-button" onClick={openFullscreen}>
              <Expand size={17} aria-hidden="true" /> Tam ekran
            </button>}
          </div>
        </section>
        <aside className="privacy-box">
          <ShieldCheck size={21} aria-hidden="true" />
          <div><strong>Ebeveynler için izleme alanı</strong>
            <p>Bu görüntü, çocuk oyun alanının ebeveynler tarafından takibi amacıyla sunulur. Erişim bağlantınızı başkalarıyla paylaşmayın.</p>
          </div>
        </aside>
        <BrandFooter />
      </div>
    </main>
  );
}

