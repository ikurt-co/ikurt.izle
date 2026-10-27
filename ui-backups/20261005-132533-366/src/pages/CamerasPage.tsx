import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Camera, Pencil, Plus, Power, X } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import { api, slugify } from "../lib/api";

interface CameraData {
  id: string; name: string; slug: string; manufacturer: string | null; model: string | null;
  connection_mode: string; recorder_model: string | null; source_type: string;
  source_host: string | null; source_port: number | null; channel_number: number | null;
  stream_profile: string; audio_enabled: number; recording_enabled: number;
  stream_status: string; enabled: number; location_id: string; location_name: string;
  has_credentials: boolean;
}
interface Location { id: string; name: string; status: string }
interface TestResult { status: string; missing: string[]; message: string }
const emptyForm = {
  location_id: "", name: "", manufacturer: "", model: "", connection_mode: "nvr",
  recorder_model: "", source_type: "rtsp", source_host: "", source_port: "", channel_number: "",
  stream_profile: "sub", username: "", password: "", audio_enabled: false, recording_enabled: false,
};
const streamLabels: Record<string, string> = {
  online: "Yayın Aktif", pending: "Yayın Bekleniyor", offline: "Çevrimdışı", error: "Yayın Hatası", disabled: "Yayın Kapalı",
};
export default function CamerasPage() {
  const [cameras, setCameras] = useState<CameraData[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editing, setEditing] = useState<CameraData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalError, setModalError] = useState("");
  const [test, setTest] = useState<TestResult | null>(null);
  const [form, setForm] = useState(emptyForm);
  const dialogRef = useRef<HTMLFormElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  async function load() {
    const [cameraData, locationData] = await Promise.all([
      api<{ cameras: CameraData[] }>("/api/admin/cameras"),
      api<{ locations: Location[] }>("/api/admin/locations"),
    ]);
    setCameras(cameraData.cameras);
    setLocations(locationData.locations);
    return cameraData.cameras;
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([api<{ cameras: CameraData[] }>("/api/admin/cameras"), api<{ locations: Location[] }>("/api/admin/locations")])
      .then(([cameraData, locationData]) => { if (!cancelled) { setCameras(cameraData.cameras); setLocations(locationData.locations); } })
      .catch(() => { if (!cancelled) setError("Kameralar yüklenemedi. Admin erişimini kontrol edin."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!showForm) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("select")?.focus();
    return () => { document.body.style.overflow = previousOverflow; opener.current?.focus(); };
  }, [showForm]);

  function open(camera: CameraData | null) {
    opener.current = document.activeElement as HTMLElement;
    setEditing(camera); setTest(null); setModalError("");
    const known = camera?.id === "cam_makaristan_cocuk_oyun_alani";
    setForm(camera ? {
      location_id: camera.location_id, name: camera.name,
      manufacturer: camera.manufacturer ?? (known ? "Dahua" : ""),
      model: camera.model ?? (known ? "DH-IPC-HDW1230V-SA" : ""),
      connection_mode: camera.connection_mode || "nvr",
      recorder_model: camera.recorder_model ?? (known ? "NVR-D855" : ""),
      source_type: camera.source_type, source_host: camera.source_host ?? "",
      source_port: camera.source_port?.toString() ?? "", channel_number: camera.channel_number?.toString() ?? "",
      stream_profile: camera.stream_profile ?? "sub", username: "", password: "",
      audio_enabled: Boolean(camera.audio_enabled), recording_enabled: Boolean(camera.recording_enabled),
    } : { ...emptyForm, location_id: locations.find(l => l.status === "active")?.id ?? "" });
    setShowForm(true);
  }
  function update<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(previous => ({ ...previous, [key]: value })); setTest(null);
  }
  async function save(testAfter: boolean) {
    setSaving(true); setModalError(""); setTest(null);
    try {
      const payload = {
        ...form, slug: editing?.slug ?? (slugify(form.name) || `kamera-${crypto.randomUUID().slice(0, 8)}`),
        source_port: form.source_port === "" ? null : Number(form.source_port),
        channel_number: form.connection_mode === "nvr" && form.channel_number !== "" ? Number(form.channel_number) : null,
        recorder_model: form.connection_mode === "nvr" ? form.recorder_model : null,
      };
      const result = await api<{ id: string }>(editing ? `/api/admin/cameras/${editing.id}` : "/api/admin/cameras", {
        method: editing ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      // Keep the saved ID even if the subsequent list/test request fails (no duplicate creates).
      setEditing(previous => ({ ...previous, ...payload, username: undefined, password: undefined, id: result.id,
        audio_enabled: form.audio_enabled ? 1 : 0, recording_enabled: form.recording_enabled ? 1 : 0, enabled: previous?.enabled ?? 1, stream_status: previous?.stream_status ?? "pending", location_name: previous?.location_name ?? "", has_credentials: Boolean((previous?.has_credentials) || (form.username && form.password)),
      } as CameraData));
      setForm(previous => ({ ...previous, username: "", password: "" }));
      const refreshed = await load();
      setEditing(refreshed.find(camera => camera.id === result.id) ?? null);
      if (testAfter) setTest(await api<TestResult>(`/api/admin/cameras/${result.id}/test`, { method: "POST" }));
      else setShowForm(false);
    } catch (err) { setModalError(err instanceof Error ? err.message : "İşlem tamamlanamadı."); }
    finally { setSaving(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    void save(button?.value === "test");
  }
  async function toggle(camera: CameraData) {
    setError(""); setSaving(true);
    try {
      await api(`/api/admin/cameras/${camera.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !camera.enabled }) });
      await load();
    } catch { setError("Kamera durumu değiştirilemedi."); }
    finally { setSaving(false); }
  }
  return <AdminLayout>
    <header className="topbar"><div><span className="eyebrow">KAMERA YÖNETİMİ</span><h1>Kameralar</h1><p>Şubelerdeki canlı yayın kameralarını yönetin.</p></div>
      <button className="primary-action" onClick={() => open(null)} disabled={loading}><Plus size={17} />Kamera Ekle</button></header>
    {error && <p className="form-notice" role="alert">{error}</p>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">KAMERALAR</span><h2>Tüm Kameralar</h2></div><span className="count-badge">{cameras.length}</span></div>
      {loading && <p className="form-notice">Kameralar yükleniyor...</p>}
      {!loading && !error && !cameras.length && <div className="empty-state">Henüz kamera yok.</div>}
      <div className="admin-list">{cameras.map(camera => <div className="admin-list-row" key={camera.id}>
        <div className="location-icon"><Camera size={20} /></div>
        <div className="admin-list-main"><strong>{camera.name}</strong><span>{camera.location_name} • {[camera.manufacturer, camera.model].filter(Boolean).join(" ") || "Marka/model girilmedi"}</span></div>
        <div className="list-meta"><span>Bağlantı</span><strong>{camera.connection_mode === "nvr" ? "NVR" : "IP Kamera"} / {camera.source_type.toUpperCase()}</strong></div>
        <div className="list-meta"><span>Akış</span><strong>{camera.stream_profile || "Belirtilmedi"}</strong></div>
        <div className="list-meta"><span>Kamera</span><strong>{camera.enabled ? "Aktif" : "Pasif"}</strong></div>
        <span className={camera.stream_status === "online" ? "success-badge" : "pending-badge"}>{streamLabels[camera.stream_status] ?? "Bilinmiyor"}</span>
        <button className="icon-action" title="Düzenle" aria-label={`${camera.name} düzenle`} onClick={() => open(camera)} disabled={saving}><Pencil size={16} /></button>
        <button className={`icon-action ${camera.enabled ? "power-on" : "power-off"}`} onClick={() => void toggle(camera)} disabled={saving} title={camera.enabled ? "Kamerayı devre dışı bırak" : "Kamerayı aktifleştir"}><Power size={16} /></button>
      </div>)}</div>
    </section>
    {showForm && <div className="modal-backdrop"><form ref={dialogRef} className="modal-card" role="dialog" aria-modal="true" aria-labelledby="camera-modal-title" onSubmit={submit} onKeyDown={event => {
      if (event.key === "Escape" && !saving) setShowForm(false);
      if (event.key === "Tab") {
        const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="modal-header"><div><span className="eyebrow">KAMERA YÖNETİMİ</span><h2 id="camera-modal-title">{editing ? "Kamerayı Düzenle" : "Kamera Ekle"}</h2></div><button type="button" className="modal-close" aria-label="Kapat" disabled={saving} onClick={() => setShowForm(false)}><X size={18} /></button></div>
      <fieldset className="camera-fields" disabled={saving}>
        <label className="field"><span>Şube</span><select required value={form.location_id} onChange={e => update("location_id", e.target.value)}><option value="">Şube seçin</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}{l.status === "active" ? "" : " (Pasif)"}</option>)}</select></label>
        <label className="field"><span>Kamera Adı</span><input required maxLength={255} value={form.name} onChange={e => update("name", e.target.value)} /></label>
        <div className="form-grid">{([['manufacturer', 'Marka'], ['model', 'Kamera Modeli']] as const).map(([key, label]) => <label className="field" key={key}><span>{label}</span><input maxLength={255} value={form[key]} onChange={e => update(key, e.target.value)} /></label>)}</div>
        <label className="field"><span>Bağlantı Kaynağı</span><select value={form.connection_mode} onChange={e => update("connection_mode", e.target.value)}><option value="nvr">NVR</option><option value="ip_camera">Doğrudan IP Kamera</option></select></label>
        {form.connection_mode === "nvr" && <label className="field"><span>NVR Modeli</span><input maxLength={255} value={form.recorder_model} onChange={e => update("recorder_model", e.target.value)} /></label>}
        <label className="field"><span>Protokol</span><select value={form.source_type} onChange={e => update("source_type", e.target.value)}><option value="rtsp">RTSP</option><option value="rtsps">RTSPS</option></select></label>
        <label className="field"><span>Host / IP</span><input maxLength={255} value={form.source_host} onChange={e => update("source_host", e.target.value)} placeholder="Müşteriden bekleniyor" /></label>
        <div className="form-grid"><label className="field"><span>RTSP Port</span><input type="number" min={1} max={65535} value={form.source_port} onChange={e => update("source_port", e.target.value)} placeholder="Müşteriden bekleniyor" /></label>
          <label className="field"><span>Kanal (NVR)</span><input type="number" min={1} max={2147483647} disabled={form.connection_mode !== "nvr"} value={form.channel_number} onChange={e => update("channel_number", e.target.value)} /></label></div>
        <label className="field"><span>Stream</span><select value={form.stream_profile} onChange={e => update("stream_profile", e.target.value)}><option value="main">Main</option><option value="sub">Sub</option></select></label>
        {editing?.has_credentials && <p className="form-notice">Kayıtlı kullanıcı adı ve şifre mevcut. Değiştirmek istemiyorsanız alanları boş bırakın.</p>}
        <label className="field"><span>Kullanıcı Adı</span><input autoComplete="off" maxLength={1024} value={form.username} onChange={e => update("username", e.target.value)} /></label>
        <label className="field"><span>Şifre</span><input type="password" autoComplete="new-password" maxLength={1024} value={form.password} onChange={e => update("password", e.target.value)} /></label>
        <div className="camera-toggles"><label><input type="checkbox" checked={form.audio_enabled} onChange={e => update("audio_enabled", e.target.checked)} /> Ses</label><label><input type="checkbox" checked={form.recording_enabled} onChange={e => update("recording_enabled", e.target.checked)} /> Kayıt</label></div>
      </fieldset>
      <p className="form-notice">Test butonu önce değişiklikleri kaydeder, ardından yapılandırmayı kontrol eder. Gerçek RTSP bağlantısı test edilmez.</p>
      {modalError && <p className="form-notice" role="alert">{modalError}</p>}
      {test && <div className="form-notice" role="status"><strong>{test.status === "READY_FOR_GATEWAY" ? "Gateway için hazır" : "Eksik alanlar"}</strong><p>{test.message}</p>{test.missing.length > 0 && <ul>{test.missing.map(field => <li key={field}>{field}</li>)}</ul>}</div>}
      <div className="form-grid"><button className="primary-button" type="submit" value="test" disabled={saving}>Bağlantıyı Test Et</button><button className="primary-button" type="submit" value="save" disabled={saving}>{saving ? "İşleniyor..." : "Kaydet"}</button></div>
    </form></div>}
  </AdminLayout>;
}

