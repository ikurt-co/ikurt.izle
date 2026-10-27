import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import AdminLayout from "../components/AdminLayout";
import BrandLogo from "../components/BrandLogo";
import { api } from "../lib/api";

export default function SettingsPage() {
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [primary, setPrimary] = useState("#1195e8");
  const [secondary, setSecondary] = useState("#172033");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await api<{
        ok: boolean;
        tenant: {
          name: string;
          logo_url: string | null;
          primary_color: string | null;
          secondary_color: string | null;
        };
      }>("/api/admin/settings");

      setName(data.tenant.name);
      setLogoUrl(data.tenant.logo_url ?? "");
      setPrimary(
        data.tenant.primary_color ?? "#1195e8",
      );
      setSecondary(
        data.tenant.secondary_color ?? "#172033",
      );
    }

    void load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();

    await api("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({
        name,
        logo_url: logoUrl,
        primary_color: primary,
        secondary_color: secondary,
      }),
    });

    setSaved(true);

    window.setTimeout(() => setSaved(false), 2500);
  }

  return (
    <AdminLayout>
      <header className="topbar">
        <div>
          <span className="eyebrow">İŞLETME AYARLARI</span>
          <h1>Ayarlar</h1>
          <p>Makaristan marka ayarlarını yönetin.</p>
        </div>
      </header>

      <form className="panel settings-form" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <span className="eyebrow">MARKA</span>
            <h2>İşletme Bilgileri</h2>
          </div>
        </div>

        <div className="settings-body">
<div className="branding-preview"><BrandLogo brand="makaristan" src={logoUrl} name={name || "Makaristan Malatya"} /><div><span className="eyebrow">MÜŞTERİ EKRANI MARKASI</span><strong>{name || "Makaristan Malatya"}</strong><p>İşletme kimliği önde, ikurt desteği alt bölümde.</p></div></div>
          <label className="field">
            <span>İşletme adı</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Logo bağlantısı</span>
            <input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://ornek.com/logo.png"
            />
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Ana renk</span>
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
              />
            </label>

            <label className="field">
              <span>İkincil renk</span>
              <input
                type="color"
                value={secondary}
                onChange={(e) =>
                  setSecondary(e.target.value)
                }
              />
            </label>
          </div>

          <button className="primary-button">
            {saved ? "Kaydedildi" : "Ayarları Kaydet"}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}

