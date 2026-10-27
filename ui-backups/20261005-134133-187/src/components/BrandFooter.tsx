
import BrandLogo from "./BrandLogo";
import "./BrandFooter.css";

const whatsappUrl = `https://wa.me/905554744544?text=${encodeURIComponent("ikurt-izle hakkında detaylı bilgi alabilir miyim")}`;

export default function BrandFooter({ businessName }: { businessName: string }) {
  return (
    <footer className="brand-footer">
      <div className="brand-footer-credit">
        <BrandLogo brand="ikurt" />
        <p>tarafından <strong>{businessName}</strong> için geliştirilmiştir.</p>
      </div>
      <nav className="brand-social-links" aria-label="ikurt iletişim bağlantıları">
        <a className="brand-social-link brand-social-link--whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp üzerinden ikurt İzle hakkında bilgi alın (yeni sekme)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.5-4.7a8.5 8.5 0 1 1 16-4.2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M8.2 7.3c-.6.2-1 1-.9 1.7.3 2.6 3.6 5.9 6.2 6.2.7.1 1.5-.3 1.7-.9l.4-1-2.1-1-.8.8c-1.5-.7-2.6-1.8-3.3-3.3l.8-.8-1-2.1-1 .4Z" fill="currentColor"/></svg>
        </a>
        <a className="brand-social-link brand-social-link--instagram" href="https://www.instagram.com/ikurt.co/" target="_blank" rel="noopener noreferrer" aria-label="ikurt Instagram hesabını açın (yeni sekme)">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
        </a>
      </nav>
    </footer>
  );
}

