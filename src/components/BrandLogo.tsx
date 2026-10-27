import { useState } from "react";
import ikurtLogo from "../assets/branding/ikurt-logo.png";
import makaristanLogo from "../assets/branding/makaristan-logo.png";

interface BrandLogoProps {
  brand: "ikurt" | "makaristan";
  src?: string | null;
  name?: string;
}

/** A white backing keeps the original dark lettering readable in every context.
 * Assets are transparent; replace them here if new brand artwork is supplied.
 */
export default function BrandLogo({ brand, src, name }: BrandLogoProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const fallback = brand === "ikurt" ? ikurtLogo : makaristanLogo;
  const imageSource = src && src !== failedSource ? src : fallback;
  return (
    <span className={`brand-logo brand-logo--${brand}${imageSource === fallback ? " brand-logo--local" : ""}`}>
      <img src={imageSource} alt={name ?? (brand === "ikurt" ? "ikurt" : "Makaristan Malatya")}
        onError={() => { if (src && imageSource === src) setFailedSource(src); }} />
    </span>
  );
}

