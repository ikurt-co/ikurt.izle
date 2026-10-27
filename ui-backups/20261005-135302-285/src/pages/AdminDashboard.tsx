import { useEffect, useState } from "react";
import {
  Activity,
  Building2,
  Camera,
  CircleDot,
  Eye,
  MapPin,
  Radio,
} from "lucide-react";

import AdminLayout from "../components/AdminLayout";
import { api } from "../lib/api";

interface Location {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  district: string | null;
  status: string;
  camera_count: number;
}

interface CameraData {
  id: string;
  name: string;
  slug: string;
  manufacturer: string | null;
  model: string | null;
  source_type: string;
  stream_status: string;
  enabled: number;
  location_name: string;
}

interface DashboardResponse {
  ok: boolean;

  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    logo_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
  };

  stats: {
    locations: number;
    cameras: number;
    online_cameras: number;
    active_viewers: number;
  };

  locations: Location[];
  cameras: CameraData[];
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(
    null,
  );

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setError(null);

        const result = await api<DashboardResponse>(
          "/api/admin/dashboard",
        );

        setData(result);
      } catch (err) {
        console.error(err);

        setError(
          err instanceof Error
            ? err.message
            : "Panel verileri alınamadı.",
        );
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return (
      <AdminLayout>
        <div className="page-loading">
          <div className="spinner" />
          <span>Panel yükleniyor...</span>
        </div>
      </AdminLayout>
    );
  }

  if (error || !data) {
    return (
      <AdminLayout>
        <div className="page-loading">
          <strong>Panel yüklenemedi</strong>

          <span>
            {error ?? "Dashboard verisi bulunamadı."}
          </span>
        </div>
      </AdminLayout>
    );
  }

  const firstCamera = data.cameras[0];

  return (
    <AdminLayout>
      <header className="topbar">
        <div>
          <span className="eyebrow">
            İŞLETME YÖNETİMİ
          </span>

          <h1>{data.tenant.name}</h1>

          <p>
            Şubelerinizi, kameralarınızı ve canlı yayın
            erişimlerini yönetin.
          </p>
        </div>

        <div className="system-status">
          <span className="status-dot" />
          Sistem aktif
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Building2 size={21} />
          </div>

          <div>
            <span>Şube</span>
            <strong>{data.stats.locations}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Camera size={21} />
          </div>

          <div>
            <span>Kamera</span>
            <strong>{data.stats.cameras}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Radio size={21} />
          </div>

          <div>
            <span>Çevrimiçi Kamera</span>
            <strong>
              {data.stats.online_cameras}
            </strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Eye size={21} />
          </div>

          <div>
            <span>Aktif İzleyici</span>
            <strong>
              {data.stats.active_viewers}
            </strong>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                ŞUBELER
              </span>

              <h2>Aktif Şubeler</h2>
            </div>

            <span className="count-badge">
              {data.locations.length}
            </span>
          </div>

          <div className="location-list">
            {data.locations.map((location) => (
              <div
                className="location-row"
                key={location.id}
              >
                <div className="location-icon">
                  <MapPin size={20} />
                </div>

                <div className="location-info">
                  <strong>
                    {location.name}
                  </strong>

                  <span>
                    {[
                      location.district,
                      location.city,
                    ]
                      .filter(Boolean)
                      .join(", ") ||
                      "Konum belirtilmedi"}
                  </span>
                </div>

                <span
                  className={
                    location.status === "active"
                      ? "success-badge"
                      : "inactive-badge"
                  }
                >
                  {location.status === "active"
                    ? "Aktif"
                    : "Pasif"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">
                CANLI YAYIN
              </span>

              <h2>Kamera Durumu</h2>
            </div>
          </div>

          {firstCamera ? (
            <div className="camera-card">
              <div className="camera-preview">
                <Camera size={38} />

                <span>
                  {firstCamera.stream_status ===
                  "online"
                    ? "Canlı yayın aktif"
                    : "Kamera bağlantısı bekleniyor"}
                </span>
              </div>

              <div className="camera-details">
                <div>
                  <span>Kamera</span>
                  <strong>
                    {firstCamera.name}
                  </strong>
                </div>

                <div>
                  <span>Şube</span>
                  <strong>
                    {firstCamera.location_name}
                  </strong>
                </div>

                <div>
                  <span>Durum</span>

                  <strong
                    className={
                      firstCamera.stream_status ===
                      "online"
                        ? ""
                        : "pending-text"
                    }
                  >
                    <CircleDot size={14} />

                    {firstCamera.stream_status ===
                    "online"
                      ? "Çevrimiçi"
                      : "Kamera bilgisi bekleniyor"}
                  </strong>
                </div>
              </div>

              <a
                href="/admin/cameras"
                className="primary-button"
                style={{
                  display: "block",
                  textAlign: "center",
                  textDecoration: "none",
                }}
              >
                Kamera Ayarları
              </a>
            </div>
          ) : (
            <div className="empty-state">
              <Camera size={28} />
              <strong>
                Kamera bulunamadı
              </strong>
              <span>
                Bu işletmeye henüz kamera
                eklenmemiş.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="panel activity-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">
              SİSTEM
            </span>

            <h2>Son Durum</h2>
          </div>

          <Activity size={20} />
        </div>

        <div className="activity-row">
          <span className="activity-dot" />

          <div>
            <strong>
              {data.locations[0]?.name ??
                "Makaristan"}{" "}
              sisteme bağlı
            </strong>

            <span>
              {firstCamera
                ? firstCamera.stream_status ===
                  "online"
                  ? `${firstCamera.name} yayını aktif.`
                  : `${firstCamera.name} kamera bilgileri bekleniyor.`
                : "Kamera kaydı bulunamadı."}
            </span>
          </div>
        </div>
      </section>
    </AdminLayout>
  );
}