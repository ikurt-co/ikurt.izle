import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Expand,
  Radio,
  ShieldCheck,
} from "lucide-react";
import { useParams } from "react-router-dom";

import { api } from "../lib/api";

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

  if (loading && code) {
    return (
      <main className="viewer-page">
        <div className="viewer-container">
          <div className="page-loading">
            <div className="spinner" />
            <span>Canlı yayın hazırlanıyor...</span>
          </div>
        </div>
      </main>
    );
  }

  if (error || !access || !session) {
    return (
      <main className="viewer-page">
        <div className="viewer-container">
          <div className="video-shell">
            <div className="video-placeholder">
              <AlertTriangle size={42} />

              <strong>
                Yayına erişilemiyor
              </strong>

              <span>
                {error ??
                  "Bu bağlantı geçerli değil veya devre dışı bırakılmış."}
              </span>
            </div>
          </div>

          <div className="privacy-box">
            <ShieldCheck size={18} />

            <p>
              Erişim bağlantınızla ilgili sorun
              devam ederse restoran personeline
              bilgi verebilirsiniz.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const online = false; // MediaMTX playback is not integrated yet.

  return (
    <main className="viewer-page">
      <div className="viewer-container">
        <header className="viewer-header">
          {session.logo_url ? (
            <img
              src={session.logo_url}
              alt={session.tenant_name}
              className="viewer-logo"
            />
          ) : (
            <div className="viewer-logo">
              {session.tenant_name
                .charAt(0)
                .toUpperCase()}
            </div>
          )}

          <div>
            <strong>
              {session.tenant_name}
            </strong>

            <span>
              {session.location_name}
            </span>
          </div>
        </header>

        <section className="viewer-title">
          <span className="live-pill">
            <Radio size={13} />

            {online ? "CANLI" : "HAZIRLANIYOR"}
          </span>

          <h1>
            {session.camera_name}
          </h1>

          <p>
            Çocuk oyun alanını canlı olarak
            takip edebilirsiniz.
          </p>
        </section>

        <div
          className="video-shell"
          ref={videoRef}
        >
          <div className="video-placeholder">
            <Radio size={42} />

            {online ? (
              <>
                <strong>
                  Canlı yayın bağlantısı hazır
                </strong>

                <span>
                  Video gateway bağlantısını
                  tamamladığımızda görüntü burada
                  oynatılacak.
                </span>
              </>
            ) : (
              <>
                <strong>
                  Kamera bağlantısı bekleniyor
                </strong>

                <span>
                  Canlı görüntü henüz bağlı değil. Kamera
                  yapılandırması ve yayın bağlantısı
                  tamamlandığında burada izlenebilecek.
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            className="fullscreen-button"
            onClick={openFullscreen}
          >
            <Expand size={17} />
            Tam ekran
          </button>
        </div>

        <div className="privacy-box">
          <ShieldCheck size={18} />

          <p>
            Bu canlı görüntü yalnızca çocuk oyun
            alanının ebeveynler tarafından takibi
            amacıyla sunulmaktadır.
          </p>
        </div>

        <footer className="viewer-footer">
          <span>Powered by</span>
          <strong>ikurt</strong>
        </footer>
      </div>
    </main>
  );
}
