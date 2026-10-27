import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  MapPin,
  Plus,
  Power,
  Trash2,
  X,
} from "lucide-react";

import AdminLayout from "../components/AdminLayout";
import { clearDeletedBusiness } from "../lib/businessSelection";
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

  const [deleting, setDeleting] = useState<Location | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [address, setAddress] = useState("");

  async function load() {
    const data = await api<LocationsResponse>(
      "/api/admin/locations",
    );

    setLocations(data.locations);
    window.dispatchEvent(new Event("ikurt:businesses-updated"));
  }

  useEffect(() => {
    let cancelled = false;
    api<LocationsResponse>("/api/admin/locations").then(data => { if (!cancelled) setLocations(data.locations); })
      .catch(() => { if (!cancelled) setError("İşletmeler yüklenemedi."); });
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

  async function deleteBusiness(event: FormEvent) {
    event.preventDefault();
    if (!deleting || saving || confirmation !== deleting.name) return;
    setSaving(true); setDeleteError("");
    try {
      await api(`/api/admin/locations/${deleting.id}`, { method: "DELETE", body: JSON.stringify({ confirmation_name: confirmation }) });
      clearDeletedBusiness(deleting.id);
      setLocations(previous => previous.filter(location => location.id !== deleting.id));
      window.dispatchEvent(new Event("ikurt:businesses-updated"));
      setDeleting(null); setConfirmation("");
    } catch (err) { setDeleteError(err instanceof Error ? err.message : "İşletme silinemedi."); }
    finally { setSaving(false); }
  }

  return (
    <AdminLayout>
      {error && <p className="form-notice" role="alert">{error}</p>}
      <header className="topbar">
        <div>
          <span className="eyebrow">İŞLETME YÖNETİMİ</span>
          <h1>İşletmeler</h1>
          <p>İşletmelerinizi ayrı kayıtlar olarak yönetin. Aynı markanın farklı konumlarını ayrı işletmeler olarak ekleyebilirsiniz.</p>
        </div>

        <button
          className="primary-action"
          onClick={() => setShowForm(true)}
        >
          <Plus size={17} />
          Yeni İşletme
        </button>
      </header>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">İŞLETMELER</span>
            <h2>Tüm İşletmeler</h2>
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
              <button type="button" className="icon-action danger-action" aria-label={`${location.name} işletmesini kalıcı sil`} title="Kalıcı sil" onClick={() => { setDeleting(location); setConfirmation(""); setDeleteError(""); }}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </section>

      {deleting && <div className="modal-backdrop"><form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-business-title" onSubmit={deleteBusiness} onKeyDown={event => { if (event.key === "Escape" && !saving) setDeleting(null); }}>
        <div className="modal-header"><h2 id="delete-business-title">İşletmeyi kalıcı sil</h2><button type="button" className="modal-close" aria-label="Kapat" disabled={saving} onClick={() => setDeleting(null)}><X size={18} /></button></div>
        <p className="form-notice">{deleting.name} işletmesi, kameraları, erişim bağlantıları ve izleyici oturumları kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>
        <label className="field"><span>Doğrulamak için işletme adını yazın: {deleting.name}</span><input autoFocus autoComplete="off" required disabled={saving} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        {deleteError && <p className="form-notice" role="alert">{deleteError}</p>}
        <div className="form-grid"><button type="button" className="primary-button" disabled={saving} onClick={() => setDeleting(null)}>Vazgeç</button><button type="submit" className="primary-button danger-action" disabled={saving || confirmation !== deleting.name}>{saving ? "Siliniyor…" : "Kalıcı Olarak Sil"}</button></div>
      </form></div>}
      {showForm && (
        <div className="modal-backdrop">
          <form className="modal-card" onSubmit={submit}>
            <div className="modal-header">
              <div>
                <span className="eyebrow">YENİ KAYIT</span>
                <h2>İşletme Ekle</h2>
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
              <span>İşletme adı</span>
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
              {saving ? "Kaydediliyor..." : "İşletmeyi Kaydet"}
            </button>
          </form>
        </div>
      )}
    </AdminLayout>
  );
}

