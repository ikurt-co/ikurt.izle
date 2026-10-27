import { useEffect, useState } from "react";
import { Radio, Server } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import { api } from "../lib/api";

interface CameraData {
  id: string;
  name: string;
  location_name: string;
  stream_status: string;
  source_type: string;
}

interface Gateway {
  id: string;
  name: string;
  provider: string;
  status: string;
  region: string | null;
}

export default function StreamsPage() {
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [gateways, setGateways] = useState<Gateway[]>([]);

  useEffect(() => {
    async function load() {
      const [cameraData, gatewayData] =
        await Promise.all([
          api<{ ok: boolean; cameras: CameraData[] }>(
            "/api/admin/cameras",
          ),
          api<{ ok: boolean; gateways: Gateway[] }>(
            "/api/admin/gateways",
          ),
        ]);

      setCameras(cameraData.cameras);
      setGateways(gatewayData.gateways);
    }

    void load();
  }, []);

  return (
    <AdminLayout>
      <header className="topbar">
        <div>
          <span className="eyebrow">YAYIN ALTYAPISI</span>
          <h1>Yayınlar</h1>
          <p>Canlı kamera ve gateway durumlarını izleyin.</p>
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">KAMERALAR</span>
              <h2>Stream Durumu</h2>
            </div>

            <Radio size={19} />
          </div>

          <div className="admin-list">
            {cameras.map((camera) => (
              <div className="admin-list-row" key={camera.id}>
                <div className="admin-list-main">
                  <strong>{camera.name}</strong>
                  <span>{camera.location_name}</span>
                </div>

                <span className="pending-badge">
                  {camera.stream_status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">GATEWAY</span>
              <h2>Video Sunucuları</h2>
            </div>

            <Server size={19} />
          </div>

          {gateways.length === 0 ? (
            <div className="empty-state">
              <Server size={28} />
              <strong>Gateway kurulmadı</strong>
              <span>
                MediaMTX sunucusunu kamera bilgileri
                geldiğinde bağlayacağız.
              </span>
            </div>
          ) : (
            <div className="admin-list">
              {gateways.map((gateway) => (
                <div
                  className="admin-list-row"
                  key={gateway.id}
                >
                  <div className="admin-list-main">
                    <strong>{gateway.name}</strong>
                    <span>{gateway.provider}</span>
                  </div>

                  <span className="success-badge">
                    {gateway.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </AdminLayout>
  );
}