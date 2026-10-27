const fs=require('node:fs');
function edit(p,fn){fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8').replaceAll('\r\n','\n')));}
edit('src/components/BusinessSwitcher.tsx',s=>s.replace('useNavigate, useSearchParams','useNavigate').replace('import BrandLogo', 'import { useBusinessSelection } from "../lib/useBusinessSelection";\nimport { clearDeletedBusiness, getBusinessSelection } from "../lib/businessSelection";\nimport BrandLogo').replace('  const [params] = useSearchParams();\n  const selectedId = params.get("business") ?? "";','  const [selectedId, selectBusiness] = useBusinessSelection();').replace('setBusinesses(data.locations); setError("");','setBusinesses(data.locations); setError(""); const current = getBusinessSelection(); if (current && !data.locations.some(b => b.id === current)) clearDeletedBusiness(current);').replace('          const next = new URLSearchParams();\n          if (event.target.value) next.set("business", event.target.value);\n          navigate({ pathname: "/admin/cameras", search: next.toString() });','          selectBusiness(event.target.value);\n          navigate("/admin/cameras");'));
edit('src/pages/CamerasPage.tsx',s=>s.replace('import { useSearchParams } from "react-router-dom";','import { useBusinessSelection } from "../lib/useBusinessSelection";').replace('  const [businessParams, setBusinessParams] = useSearchParams();\n  const selectedBusinessId = businessParams.get("business") ?? "";','  const [selectedBusinessId, selectBusiness] = useBusinessSelection();').replace('onClick={() => { const next = new URLSearchParams(businessParams); next.delete("business"); setBusinessParams(next); }}','onClick={() => selectBusiness("")}'));
edit('worker/index.ts',s=>s.replace('      if (locationMatch && method === "PATCH") {',`      if (locationMatch && method === "DELETE") {
        const body = await getBody<{ confirmation_name?: unknown }>(request);
        if (typeof body?.confirmation_name !== "string" || !body.confirmation_name) {
          throw new HttpError(400, "Silmek için işletmenin adını eksiksiz yazın.");
        }
        // A single conditional statement: confirmation and tenant scope cannot race with a rename.
        // D1's verified ON DELETE CASCADE removes cameras, access links and viewer sessions atomically.
        const result = await env.ikurt_izle_db.prepare(
          "DELETE FROM locations WHERE id = ? AND tenant_id = ? AND name = ?"
        ).bind(locationMatch[1], TENANT_ID, body.confirmation_name).run();
        if (!result.meta.changes) throw new HttpError(409, "İşletme adı eşleşmedi veya kayıt artık mevcut değil. Listeyi yenileyin.");
        return json({ ok: true, id: locationMatch[1] });
      }

      if (locationMatch && method === "PATCH") {`));
edit('src/pages/LocationsPage.tsx',s=>s.replace('  Power,','  Power,\n  Trash2,').replace('import { api, slugify }','import { clearDeletedBusiness } from "../lib/businessSelection";\nimport { api, slugify }').replace('  const [name, setName]', '  const [deleting, setDeleting] = useState<Location | null>(null);\n  const [confirmation, setConfirmation] = useState("");\n  const [deleteError, setDeleteError] = useState("");\n\n  const [name, setName]').replace('  return (\n    <AdminLayout>',`  async function deleteBusiness(event: FormEvent) {
    event.preventDefault();
    if (!deleting || saving || confirmation !== deleting.name) return;
    setSaving(true); setDeleteError("");
    try {
      await api(\u0060/api/admin/locations/\u0024{deleting.id}\u0060, { method: "DELETE", body: JSON.stringify({ confirmation_name: confirmation }) });
      clearDeletedBusiness(deleting.id);
      setLocations(previous => previous.filter(location => location.id !== deleting.id));
      window.dispatchEvent(new Event("ikurt:businesses-updated"));
      setDeleting(null); setConfirmation("");
    } catch (err) { setDeleteError(err instanceof Error ? err.message : "İşletme silinemedi."); }
    finally { setSaving(false); }
  }

  return (
    <AdminLayout>`).replace('                <Power size={16} />\n              </button>','                <Power size={16} />\n              </button>\n              <button type="button" className="icon-action danger-action" aria-label={`${location.name} işletmesini kalıcı sil`} title="Kalıcı sil" onClick={() => { setDeleting(location); setConfirmation(""); setDeleteError(""); }}><Trash2 size={16} /></button>').replace('      {showForm && (',`      {deleting && <div className="modal-backdrop"><form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="delete-business-title" onSubmit={deleteBusiness} onKeyDown={event => { if (event.key === "Escape" && !saving) setDeleting(null); }}>
        <div className="modal-header"><h2 id="delete-business-title">İşletmeyi kalıcı sil</h2><button type="button" className="modal-close" aria-label="Kapat" disabled={saving} onClick={() => setDeleting(null)}><X size={18} /></button></div>
        <p className="form-notice">{deleting.name} işletmesi, kameraları, erişim bağlantıları ve izleyici oturumları kalıcı olarak silinecek. Bu işlem geri alınamaz.</p>
        <label className="field"><span>Doğrulamak için işletme adını yazın: {deleting.name}</span><input autoFocus autoComplete="off" required disabled={saving} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
        {deleteError && <p className="form-notice" role="alert">{deleteError}</p>}
        <div className="form-grid"><button type="button" className="primary-button" disabled={saving} onClick={() => setDeleting(null)}>Vazgeç</button><button type="submit" className="primary-button danger-action" disabled={saving || confirmation !== deleting.name}>{saving ? "Siliniyor…" : "Kalıcı Olarak Sil"}</button></div>
      </form></div>}
      {showForm && (`));
