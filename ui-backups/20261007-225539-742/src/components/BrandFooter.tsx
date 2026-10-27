
import BrandLogo from "./BrandLogo";
import makaristanLogo from "../assets/makaristan-logo.png";
import whatsappLogo from "../assets/branding/whatsapp-logo.png";
import instagramLogo from "../assets/branding/instagram-logo.png";
import "./BrandFooter.css";

const whatsappUrl = `https://wa.me/905554744544?text=${encodeURIComponent("ikurt-izle hakkında detaylı bilgi alabilir miyim")}`;

export default function BrandFooter() {
  return (
    <footer className="brand-footer">
      <div className="brand-footer-credit">
        <BrandLogo brand="ikurt" />
        <p>tarafından</p>
        <img className="brand-footer-business-logo" src={makaristanLogo} alt="Makaristan Malatya" decoding="async" />
      </div>
      <nav className="brand-social-links" aria-label="ikurt iletişim bağlantıları">
        <a className="brand-social-link brand-social-link--whatsapp" href={whatsappUrl} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp üzerinden ikurt İzle hakkında bilgi alın (yeni sekme)">
          <img src={whatsappLogo} alt="" aria-hidden="true" width={24} height={24} decoding="async" />
          <span>İletişim için</span>
        </a>
        <a className="brand-social-link brand-social-link--instagram" href="https://www.instagram.com/ikurt.co/" target="_blank" rel="noopener noreferrer" aria-label="ikurt Instagram hesabını açın (yeni sekme)">
          <img src={instagramLogo} alt="" aria-hidden="true" width={24} height={24} decoding="async" />
          <span>Bizi takip edin</span>
        </a>
      </nav>
    </footer>
  );
}


