import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  MapPin,
  Plus,
  Power,
  X,
} from "lucide-react";

import AdminLayout from "../components/AdminLayout";
import { api, slugify } from "../lib/api";

interface Location {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  district: string | null;
  address: string | null;
  status: "active" | "inactive";
  camera_count: number;
}

interface LocationsResponse {
  ok: boolean;
  locations: Location[];
}

export default function LocationsPage() {
  const [error, setError] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");

  async function load() {
    const data = await api<LocationsResponse>(
      "/api/admin/locations",
    );

    setLocations(data.locations);
  }

  useEffect(() => {
    let cancelled = false;
    api<LocationsResponse>("/api/admin/locations").then(data => { if (!cancelled) setLocations(data.locations); })
      .catch(() => { if (!cancelled) setError("Şubeler yüklenemedi."); });
    return () => { cancelled = true; };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();

    setSaving(true);

    try {
      await api("/api/admin/locations", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug: slugify(name),
          city,
          district,
          address,
        }),
      });

      setName("");
      setCity("");
      setDistrict("");
      setAddress("");
      setShowForm(false);

      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(location: Location) {
    await api(`/api/admin/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        status:
          location.status === "active"
            ? "inactive"
            : "active",
      }),
    });

    await load();
  }

  return (
    <AdminLayout>
      {error && <p className="form-notice" role="alert">{error}</p>}
      <header className="topbar">
        <div>
          <span className="eyebrow">ŞUBE YÖNETİMİ</span>
          <h1>Şubeler</h1>
          <p>Makaristan şubelerini yönetin.</p>
        </div>

        <button
          className="primary-action"
          onClick={() => setShowForm(true)}
        >
          <Plus size={17} />
          Yeni Şube
        </button>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">ŞUBELER</span>
            <h2>Tüm Şubeler</h2>
          </div>

          <span className="count-badge">
            {locations.length}
          </span>
        </div>

        <div className="admin-list">
          {locations.map((location) => (
            <div className="admin-list-row" key={location.id}>
              <div className="location-icon">
                <MapPin size={20} />
              </div>

              <div className="admin-list-main">
                <strong>{location.name}</strong>

                <span>
                  {[location.district, location.city]
                    .filter(Boolean)
                    .join(", ") || "Konum belirtilmedi"}
                </span>
              </div>

              <div className="list-meta">
                <span>Kamera</span>
                <strong>{location.camera_count}</strong>
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

              <button
                className="icon-action"
                onClick={() => toggle(location)}
                title="Durumu değiştir"
              >
                <Power size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {showForm && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">YENİ KAYIT</span>
                <h2>Şube Ekle</h2>
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
              <span>Şube adı</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Makaristan Elazığ"
              />
            </label>

            <div className="form-grid">
              <label className="field">
                <span>İl</span>
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>

              <label className="field">
                <span>İlçe</span>
                <input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </label>
            </div>

            <label className="field">
              <span>Adres</span>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

            <button
              className="primary-button"
              disabled={saving}
            >
              {saving ? "Kaydediliyor..." : "Şubeyi Kaydet"}
            </button>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}