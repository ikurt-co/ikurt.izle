import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {

  Menu,
  X,
  Camera,
  ChartNoAxesCombined,
  Link2,
  MapPinned,
  Settings,
  Users,
  Video,
} from "lucide-react";

import BrandLogo from "./BrandLogo";
import BusinessSwitcher from "./BusinessSwitcher";
import ikurtLogo from "../assets/branding/ikurt-logo.png";
import makaristanLogo from "../assets/branding/makaristan-logo.png";

interface Props {
  children: ReactNode;
}

const menu = [
  {
    label: "Genel Bakış",
    icon: ChartNoAxesCombined,
    to: "/admin",
    end: true,
  },
  {
    label: "İşletmeler",
    icon: MapPinned,
    to: "/admin/businesses",
  },
  {
    label: "Kameralar",
    icon: Camera,
    to: "/admin/cameras",
  },
  {
    label: "QR / NFC Bağlantıları",
    icon: Link2,
    to: "/admin/access-links",
  },
  {
    label: "Aktif İzleyiciler",
    icon: Users,
    to: "/admin/viewers",
  },
  {
    label: "Yayınlar",
    icon: Video,
    to: "/admin/streams",
  },
];

export default function AdminLayout({ children }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const drawer = drawerRef.current;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    drawer?.showModal();
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      drawer?.close();
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener("change", closeOnDesktop);
      menuButton?.focus();
    };
  }, [menuOpen]);

  function navigation() {
    return <>
      <div className="brand" aria-label="ikurt İzle yönetim paneli"><BrandLogo brand="ikurt" /></div>
      <BusinessSwitcher />
      <nav className="nav-list" aria-label="Yönetim menüsü">
        {menu.map((item) => {
          const Icon = item.icon;
          return <NavLink key={item.to} to={item.to} end={item.end}
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
            <Icon size={18} aria-hidden="true" />{item.label}
          </NavLink>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <NavLink to="/admin/settings" onClick={() => setMenuOpen(false)}
          className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}>
          <Settings size={18} aria-hidden="true" />Ayarlar
        </NavLink>
        {import.meta.env.PROD && <a className="nav-item" href="/cdn-cgi/access/logout">Güvenli çıkış</a>}
      </div>
    </>;
  }

  return (
    <div className="admin-shell">
      <header className="admin-mobile-header">
        <BrandLogo brand="ikurt" />
        <button ref={menuButtonRef} className="admin-menu-button" type="button"
          aria-label="Yönetim menüsünü aç" aria-expanded={menuOpen} aria-controls="admin-mobile-menu"
          onClick={() => setMenuOpen(true)}><Menu size={22} aria-hidden="true" /><span>Menü</span></button>
      </header>
      <aside className="sidebar">{navigation()}</aside>
      <dialog ref={drawerRef} id="admin-mobile-menu" className="admin-drawer"
        aria-label="Yönetim menüsü" onCancel={() => setMenuOpen(false)}
        onKeyDown={event => {
          if (event.key !== "Tab") return;
          const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], select:not(:disabled)"));
          const first = targets[0];
          const last = targets[targets.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}
        onClick={event => { if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setMenuOpen(false);
        } }}>
        {menuOpen && <>
          <div className="drawer-heading"><span>Yönetim menüsü</span>
            <button type="button" className="admin-menu-button" aria-label="Menüyü kapat" autoFocus
              onClick={() => setMenuOpen(false)}><X size={22} aria-hidden="true" /></button>
          </div>
          <div className="drawer-navigation" onChange={() => setMenuOpen(false)}>{navigation()}</div>
        </>}
      </dialog>
      <main className="admin-main">{children}</main>
      <footer className="admin-mobile-footer">
        <p className="admin-mobile-footer-credit">
          <span>Bu sistem</span>
          <img className="admin-mobile-footer-ikurt" src={ikurtLogo} alt="ikurt" />
          <span>tarafından</span>
          <img className="admin-mobile-footer-business" src={makaristanLogo} alt="Makaristan Malatya" />
          <span>için yapılmıştır</span>
        </p>
        <p className="admin-mobile-footer-rights">Tüm hakları saklıdır.</p>
      </footer>
    </div>
  );
}
