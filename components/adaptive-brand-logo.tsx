import type { CSSProperties } from "react";

/** Website-only adaptive mark. The installed PWA icon remains the fixed original brand. */
export default function AdaptiveBrandLogo({
  size = 37,
  className = "",
  label = "",
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={`adaptive-brand-logo ${className}`.trim()}
      style={{ "--adaptive-logo-size": `${size}px` } as CSSProperties}
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    />
  );
}
