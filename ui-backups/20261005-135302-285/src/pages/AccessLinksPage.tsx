import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Copy,
  ExternalLink,
  Link2,
  Plus,
  Power,
  X,
} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import { api } from "../lib/api";

interface AccessLink {
  id: string;
  code: string;
  label: string;
  status: string;
  session_duration_minutes: number;
  scan_count: number;
  last_accessed_at: string | null;
  camera_id: string;
  camera_name: string;
  location_name: string;
}

interface CameraData {
  id: string;
  name: string;
  location_name: string;
}

export default function AccessLinksPage() {
  const [error, setError] = useState("");
  const [links, setLinks] = useState<AccessLink[]>([]);
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [cameraId, setCameraId] = useState("");
  const [label, setLabel] = useState(
    "Çocuk Oyun Alanı QR / NFC",
  );
  const [duration, setDuration] = useState(30);

  async function load() {
    const [linkData, cameraData] = await Promise.all([
      api<{ ok: boolean; links: AccessLink[] }>(
        "/api/admin/access-links",
      ),
      api<{ ok: boolean; cameras: CameraData[] }>(
        "/api/admin/cameras",
      ),
    ]);

    setLinks(linkData.links);
    setCameras(cameraData.cameras);

    if (!cameraId && cameraData.cameras[0]) {
      setCameraId(cameraData.cameras[0].id);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<{ links: AccessLink[] }>("/api/admin/access-links"), api<{ cameras: CameraData[] }>("/api/admin/cameras")])
      .then(([linkData, cameraData]) => {
        if (cancelled) return;
        setLinks(linkData.links); setCameras(cameraData.cameras);
        setCameraId(previous => previous || cameraData.cameras[0]?.id || "");
      }).catch(() => { if (!cancelled) setError("Erişim bağlantıları yüklenemedi."); });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();

    await api("/api/admin/access-links", {
      method: "POST",
      body: JSON.stringify({
        camera_id: cameraId,
        label,
        session_duration_minutes: duration,
      }),
    });

    setShowForm(false);
    await load();
  }

  async function toggle(link: AccessLink) {
    await api(`/api/admin/access-links/${link.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status:
          link.status === "active"
            ? "disabled"
            : "active",
      }),
    });

    await load();
  }

  function fullUrl(code: string) {
    return `${window.location.origin}/c/${code}`;
  }

  return (
    <AdminLayout>
      {error && <p className="form-notice" role="alert">{error}</p>}
      <header className="topbar">
        <div>
          <span className="eyebrow">ERİŞİM YÖNETİMİ</span>
          <h1>QR / NFC Bağlantıları</h1>
          <p>
            Pleksilerde kullanılacak kalıcı erişim bağlantılarını
            yönetin.
          </p>
        </div>

        <button
          className="primary-action"
          onClick={() => setShowForm(true)}
        >
          <Plus size={17} />
          Link Oluştur
        </button>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ERİŞİM BAĞLANTILARI</span>
            <h2>Tüm Bağlantılar</h2>
          </div>

          <span className="count-badge">{links.length}</span>
        </div>

        {links.length === 0 ? (
          <div className="empty-state">
            <Link2 size={28} />
            <strong>Henüz erişim bağlantısı yok</strong>
            <span>
              İlk QR/NFC linkini oluşturabilirsiniz.
            </span>
          </div>
        ) : (
          <div className="admin-list">
            {links.map((link) => (
              <div className="admin-list-row" key={link.id}>
                <div className="location-icon">
                  <Link2 size={19} />
                </div>

                <div className="admin-list-main">
                  <strong>{link.label}</strong>
                  <span>
                    {link.location_name} • {link.camera_name}
                  </span>

                  <code className="link-code">
                    /c/{link.code}
                  </code>
                </div>

                <div className="list-meta">
                  <span>Okutma</span>
                  <strong>{link.scan_count}</strong>
                </div>

                <div className="list-meta">
                  <span>Oturum</span>
                  <strong>
                    {link.session_duration_minutes} dk
                  </strong>
                </div>

                <button
                  className="icon-action"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      fullUrl(link.code),
                    )
                  }
                  title="Linki kopyala"
                >
                  <Copy size={16} />
                </button>

                <a
                  className="icon-action"
                  href={`/c/${link.code}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} />
                </a>

                <button
                  className="icon-action"
                  onClick={() => toggle(link)}
                >
                  <Power size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">YENİ ERİŞİM</span>
                <h2>QR / NFC Bağlantısı Oluştur</h2>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setShowForm(false)}
              >
                <X size={18} />
              </button>
            </div>

            <label className="field">
              <span>Kamera</span>
              <select
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
              >
                {cameras.map((camera) => (
                  <option key={camera.id} value={camera.id}>
                    {camera.location_name} — {camera.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Bağlantı adı</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>

            <label className="field">
              <span>İzleme oturumu</span>
              <select
                value={duration}
                onChange={(e) =>
                  setDuration(Number(e.target.value))
                }
              >
                <option value={15}>15 dakika</option>
                <option value={30}>30 dakika</option>
                <option value={45}>45 dakika</option>
                <option value={60}>60 dakika</option>
                <option value={120}>120 dakika</option>
              </select>
            </label>

            <button className="primary-button">
              Güvenli Link Oluştur
            </button>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}
