const fs=require('node:fs');
let s=fs.readFileSync('src/lib/api.ts','utf8').replaceAll('\r\n','\n');s=s.replace('    ...options,','    ...options,\n    redirect: path.startsWith("/api/admin/") ? "manual" : options.redirect,');s=s.replace('  const data = (await response.json())',`  if (response.type === "opaqueredirect" && path.startsWith("/api/admin/")) {
    window.location.assign("/admin");
    throw new Error("Yönetici oturumunuz sona erdi. Yeniden giriş yapın.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Sunucu yanıtı alınamadı. Yönetici oturumunuzu kontrol edin.");
  }
  const data = (await response.json())`);fs.writeFileSync('src/lib/api.ts',s);
s=fs.readFileSync('src/components/AdminLayout.tsx','utf8').replaceAll('\r\n','\n');s=s.replace('            Ayarlar\n          </NavLink>','            Ayarlar\n          </NavLink>\n          {import.meta.env.PROD && <a className="nav-item" href="/cdn-cgi/access/logout">Güvenli çıkış</a>}');fs.writeFileSync('src/components/AdminLayout.tsx',s);
