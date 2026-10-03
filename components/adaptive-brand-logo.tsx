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
    >
      <svg className="f1-brand-mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path className="f1-badge-panel" d="M0 0h64v64H0z" />
        <path className="f1-badge-stripe" d="M40 0h13L24 64H11z" />
        <path d="M25 12h15M28 13v16L18 46q-3 6 4 6h22q7 0 4-6L37 29V13" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
        <path className="f1-badge-liquid" d="m25 37-5 10q-1 2 2 2h22q3 0 2-2l-6-10z" />
        <path d="M7 25h12M5 32h10M3 39h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path className="f1-badge-accent" d="M48 10h5v5h-5zm5 5h5v5h-5zm-5 5h5v5h-5z" />
      </svg>
    </span>
  );
}
