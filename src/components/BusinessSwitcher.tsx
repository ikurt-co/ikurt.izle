import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useBusinessSelection } from "../lib/useBusinessSelection";
import { clearDeletedBusiness, getBusinessSelection } from "../lib/businessSelection";
import BrandLogo from "./BrandLogo";

interface Business { id: string; name: string; city: string | null; status: string }

/** Existing location records are presented as independently selectable businesses.
 * This is camera navigation, not a tenant/authorization switch.
 */
export default function BusinessSwitcher() {
  const navigate = useNavigate();
  const [selectedId, selectBusiness] = useBusinessSelection();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let controller: AbortController;
    function load() {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      api<{ locations: Business[] }>("/api/admin/locations", { signal })
        .then(data => { if (!cancelled && !signal.aborted) { setBusinesses(data.locations); setError(""); const current = getBusinessSelection(); if (current && !data.locations.some(b => b.id === current)) clearDeletedBusiness(current); } })
        .catch(() => { if (!cancelled && !signal.aborted) setError("İşletmeler yüklenemedi."); })
        .finally(() => { if (!cancelled && !signal.aborted) setLoading(false); });
    }
    load();
    window.addEventListener("ikurt:businesses-updated", load);
    return () => { cancelled = true; controller?.abort(); window.removeEventListener("ikurt:businesses-updated", load); };
  }, []);

  const selected = businesses.find(business => business.id === selectedId);
  const name = selected?.name ?? "Tüm işletmeler";
  const isMakaristan = selected?.id === "loc_makaristan_malatya" || Boolean(selected && /makaristan/i.test(selected.name));

  return (
    <div className="tenant-card">
      <span className="tenant-label">İşletme</span>
      {isMakaristan ? <BrandLogo brand="makaristan" name={name} /> : <div className="business-initial" aria-hidden="true">{selected ? name.charAt(0).toLocaleUpperCase("tr-TR") : "İ"}</div>}
      <strong className="tenant-name">{name}</strong>
      <label className="business-switcher">
        <span>İşletme seç</span>
        <select value={selected?.id ?? ""} disabled={loading || Boolean(error)} onChange={event => {
          selectBusiness(event.target.value);
          navigate("/admin/cameras");
        }}>
          <option value="">{loading ? "Yükleniyor…" : "Tüm işletmeler"}</option>
          {businesses.map(business => <option key={business.id} value={business.id}>{business.name}{business.status === "active" ? "" : " (Pasif)"}</option>)}
        </select>
      </label>
      {error && <p className="business-switcher-error" role="status">{error}</p>}
    </div>
  );
}

