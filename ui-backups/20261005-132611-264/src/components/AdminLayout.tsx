import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {

  Camera,
  ChartNoAxesCombined,
  Link2,
  MapPinned,
  Settings,
  Users,
  Video,
} from "lucide-react";

import BrandLogo from "./BrandLogo";
import BrandFooter from "./BrandFooter";

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
    label: "Şubeler",
    icon: MapPinned,
    to: "/admin/locations",
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
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand" aria-label="ikurt İzle yönetim paneli">
          <BrandLogo brand="ikurt" />
        </div>
        <div className="tenant-card">
          <span className="tenant-label">İşletme</span>
          <BrandLogo brand="makaristan" />
          <strong className="tenant-name">Makaristan Malatya</strong>
        </div>
        <nav className="nav-list">
          {menu.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <NavLink
            to="/admin/settings"
            className={({ isActive }) =>
              `nav-item ${isActive ? "active" : ""}`
            }
          >
            <Settings size={18} />
            Ayarlar
          </NavLink>

          <BrandFooter businessName="Makaristan Malatya" />
        </div>
      </aside>

      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}


