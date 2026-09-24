import type { ReactNode } from "react";

export function ExportHeader({ brand, meta }: { brand: string; meta: string }) {
  return <header className="export-heading"><div className="export-eyebrow">解題實驗室 · 學習筆記</div><h2>{brand}</h2><p>{meta}</p></header>;
}
export function ExportSection({ kind, title, children }: { kind: "question" | "answer" | "concept" | "options" | "diagram"; title: string; children: ReactNode }) {
  return <section className={`export-section export-section-${kind}`}><h3>{title}</h3><div className="export-section-body">{children}</div></section>;
}
