import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { useBusinessSelection } from "../lib/useBusinessSelection";
import "./StreamSettings.css";

interface Camera { id: string; name: string; gateway_id?: string | null; enabled?: number; last_online_at?: string | null; last_error?: string | null }
interface Gateway { id: string; name: string }
type Hours = Record<string, [string, string][]>;
const days = [["mon", "Pazartesi"], ["tue", "Salı"], ["wed", "Çarşamba"], ["thu", "Perşembe"], ["fri", "Cuma"], ["sat", "Cumartesi"], ["sun", "Pazar"]];
const emptyHours = (): Hours => Object.fromEntries(days.map(([day]) => [day, []]));
const changed = () => window.dispatchEvent(new Event("ikurt:streams-updated"));
function PolicyEditor({ location }: { location: string }) {
  const [minutes, setMinutes] = useState(60);
  const [maximum, setMaximum] = useState(25);
  const [zone, setZone] = useState("Europe/Istanbul");
  const [allDay, setAllDay] = useState(false);
  const [hours, setHours] = useState<Hours>(emptyHours);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    api<{ policy: { session_minutes: number; max_viewers: number; timezone: string; weekly_hours: string | null } }>("/api/admin/stream-policies?location_id=" + encodeURIComponent(location), { signal: abort.signal })
      .then(({ policy }) => { setMinutes(policy.session_minutes); setMaximum(policy.max_viewers); setZone(policy.timezone); setAllDay(policy.weekly_hours === null); setHours(policy.weekly_hours ? JSON.parse(policy.weekly_hours) : emptyHours()); setReady(true); })
      .catch(() => { if (!abort.signal.aborted) setMessage("Yayın politikaları henüz hazır değil. Yerel kurulum ve migration adımını tamamlayın."); });
    return () => abort.abort();
  }, [location]);
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await api("/api/admin/stream-policies?location_id=" + encodeURIComponent(location), { method: "PUT", body: JSON.stringify({ session_minutes: minutes, max_viewers: maximum, timezone: zone, weekly_hours: allDay ? null : JSON.stringify(hours) }) }); setMessage("İzleme kuralları kaydedildi."); }
    catch { setMessage("Kurallar kaydedilemedi. Saat aralıklarını ve erişiminizi kontrol edin."); }
    finally { setBusy(false); }
  }
  return <form className="stream-settings-form" onSubmit={save}>
    <div className="form-grid">
      <label className="field"><span>Oturum süresi (dakika)</span><input type="number" min={5} max={240} value={minutes} onChange={e => setMinutes(Number(e.target.value))} /></label>
      <label className="field"><span>Eş zamanlı izleyici sınırı</span><input type="number" min={1} max={500} value={maximum} onChange={e => setMaximum(Number(e.target.value))} /></label>
      <label className="field"><span>Saat dilimi</span><input value={zone} onChange={e => setZone(e.target.value)} /></label>
    </div>
    <label className="stream-checkbox"><input type="checkbox" checked={allDay} onChange={e => setAllDay(e.target.checked)} /> İzlemeye 24 saat izin ver</label>
    {!allDay && <div className="stream-hours">{days.map(([day, label]) => <div className="stream-day" key={day}>
      <label className="stream-checkbox"><input type="checkbox" checked={hours[day].length > 0} onChange={e => setHours({ ...hours, [day]: e.target.checked ? [["09:00", "22:00"]] : [] })} />{label}</label>
      {hours[day].map(([start, end], index) => <div className="stream-range" key={index}>
        <input aria-label={label + " açılış " + (index + 1)} type="time" value={start} required onChange={e => setHours({ ...hours, [day]: hours[day].map((range, i) => i === index ? [e.target.value, range[1]] : range) })} />
        <span>–</span><input aria-label={label + " kapanış " + (index + 1)} type="time" value={end === "24:00" ? "00:00" : end} required onChange={e => setHours({ ...hours, [day]: hours[day].map((range, i) => i === index ? [range[0], e.target.value === "00:00" ? "24:00" : e.target.value] : range) })} />
        <button type="button" aria-label={label + " saat aralığını kaldır"} onClick={() => setHours({ ...hours, [day]: hours[day].filter((_, i) => i !== index) })}>Kaldır</button>
      </div>)}
      {hours[day].length > 0 && hours[day].length < 3 && <button type="button" onClick={() => setHours({ ...hours, [day]: [...hours[day], ["09:00", "22:00"]] })}>Saat ekle</button>}
    </div>)}</div>}
    <p className="form-notice">Kapalı günlerde görüntü verilmez. Gece yarısını aşan saatleri iki güne bölün. Kapanışta 00:00 gün sonu anlamına gelir. URL paylaşımı bu kurallarla tamamen engellenemez.</p>
    <button className="primary-button" disabled={!ready || busy}>{busy ? "Kaydediliyor…" : "Kuralları kaydet"}</button>
    {message && <p role="status">{message}</p>}
  </form>;
}

export default function StreamSettings({ cameras, gateways }: { cameras: Camera[]; gateways: Gateway[] }) {
  const [selected] = useBusinessSelection();
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [location, setLocation] = useState(selected);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ locations: { id: string; name: string }[] }>("/api/admin/locations").then(data => setLocations(data.locations)).catch(() => setMessage("İşletmeler yüklenemedi.")); }, []);
  async function action(work: () => Promise<unknown>) {
    setBusy(true);
    try { const result = await work(); changed(); setMessage(result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "İşlem tamamlandı."); }
    catch { setMessage("İşlem tamamlanamadı. Yayın altyapısı, sunucu eşleştirmesi ve yetkileri kontrol edin."); }
    finally { setBusy(false); }
  }
  return <section className="panel stream-settings">
    <div className="panel-heading"><div><span className="eyebrow">GÜVENLİ YAYIN</span><h2>Yayın Bağlantıları ve İzleme Kuralları</h2></div></div>
    <div className="settings-body">
      <p className="form-notice">Sunucu ve kamera eşleştirmesi görüntünün doğrulandığı anlamına gelmez. Gerçek RTSP erişimi ve işletme onayı olmadan gerçek kamerayı başlatmayın.</p>
      <form className="stream-settings-form" onSubmit={e => {
        e.preventDefault(); const data = new FormData(e.currentTarget);
        void action(() => api("/api/admin/gateways", { method: "POST", body: JSON.stringify(Object.fromEntries(data)) }));
      }}>
        <h3>Yayın sunucusu ekle</h3>
        <div className="form-grid">
          <label className="field"><span>Sunucu kimliği</span><input name="id" required pattern="[a-zA-Z0-9_-]+" placeholder="gw_makaristan" maxLength={96} /></label>
          <label className="field"><span>Sunucu adı</span><input name="name" required maxLength={80} /></label>
          <label className="field"><span>Güvenli medya adresi</span><input name="public_base_url" type="url" required placeholder="https://media.ikurt.net" /></label>
        </div><button className="primary-button" disabled={busy}>Sunucuyu ekle</button>
      </form>
      <h3>Kamera eşleştirmeleri</h3>
      {cameras.map(camera => <div className="stream-camera" key={camera.id}><strong>{camera.name}</strong>
        <select aria-label={camera.name + " yayın sunucusu"} disabled={busy} value={camera.gateway_id ?? ""} onChange={e => void action(() => api("/api/admin/cameras/" + camera.id, { method: "PATCH", body: JSON.stringify({ gateway_id: e.target.value || null }) }))}>
          <option value="">Sunucu seçilmedi</option>{gateways.map(gateway => <option key={gateway.id} value={gateway.id}>{gateway.name}</option>)}
        </select>
        <button type="button" disabled={busy || !camera.gateway_id} onClick={() => void action(() => api("/api/admin/stream-probe/" + camera.id, { method: "POST" }))}>Yayını doğrula</button>
        <button type="button" disabled={busy} onClick={() => void action(() => api("/api/admin/cameras/" + camera.id, { method: "PATCH", body: JSON.stringify({ enabled: !camera.enabled }) }))}>{camera.enabled ? "İzlemeyi durdur" : "İzlemeyi etkinleştir"}</button>
        <small>Son doğrulanan bağlantı: {camera.last_online_at ?? "Henüz doğrulanmadı"}{camera.last_error ? " · " + camera.last_error : ""}</small>
      </div>)}
      <h3>İşletmeye özel izleme kuralları</h3>
      <label className="field"><span>İşletme</span><select value={location} onChange={e => setLocation(e.target.value)}><option value="">İşletme seçin</option>{locations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {location && <PolicyEditor key={location} location={location} />}
      {message && <p role="status">{message}</p>}
    </div>
  </section>;
}
