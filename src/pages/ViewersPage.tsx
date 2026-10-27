import { useEffect, useState } from "react";
import { Eye, Users } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import { api } from "../lib/api";

interface Viewer {
  id: string;
  status: string;
  is_active: number;
  created_at: string;
  expires_at: string;
  last_seen_at: string | null;
  camera_name: string;
  location_name: string;
  access_label: string;
}

export default function ViewersPage() {
  const [viewers, setViewers] = useState<Viewer[]>([]);

  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    function load() {
      api<{ viewers: Viewer[] }>("/api/admin/viewers").then(data => {
        if (!cancelled) { setViewers(data.viewers); setError(""); }
      }).catch(() => { if (!cancelled) setError("İzleyici bilgileri güncellenemedi."); });
    }
    load();
    const timer = window.setInterval(load, 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const active = viewers.filter(
    (viewer) =>
      Boolean(viewer.is_active),
  );

  return (
    <AdminLayout>
      {error && <p className="form-notice" role="alert">{error}</p>}
      <header className="topbar">
        <div>
          <span className="eyebrow">CANLI TAKİP</span>
          <h1>Aktif İzleyiciler</h1>
          <p>
            QR veya NFC üzerinden açılan oturumları takip edin.
          </p>
        </div>

        <div className="system-status">
          {active.length} aktif oturum
        </div>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">OTURUMLAR</span>
            <h2>İzleme Geçmişi</h2>
          </div>

          <Users size={20} />
        </div>

        {viewers.length === 0 ? (
          <div className="empty-state">
            <Eye size={28} />
            <strong>Henüz izleyici yok</strong>
            <span>
              İlk QR/NFC okutulduğunda oturum burada
              görünecek.
            </span>
          </div>
        ) : (
          <div className="admin-list">
            {viewers.map((viewer) => {
              const isActive =
                Boolean(viewer.is_active);

              return (
                <div
                  className="admin-list-row"
                  key={viewer.id}
                >
                  <div className="location-icon">
                    <Eye size={18} />
                  </div>

                  <div className="admin-list-main">
                    <strong>{viewer.camera_name}</strong>
                    <span>
                      {viewer.location_name} •{" "}
                      {viewer.access_label}
                    </span>
                  </div>

                  <span
                    className={
                      isActive
                        ? "success-badge"
                        : "inactive-badge"
                    }
                  >
                    {isActive ? "Aktif" : "Aktif değil"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AdminLayout>
  );
}