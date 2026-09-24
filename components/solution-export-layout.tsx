import type { ReactNode } from "react";

export type ExportStudent = { region: string; institution: string; className: string; name: string };

export function ExportHeader({ brand, meta, student }: { brand: string; meta: string; student?: ExportStudent | null }) {
  return <header className="export-heading"><div className="export-eyebrow">解題實驗室 · 學習筆記</div><h2>{brand}</h2><p>{meta}</p>{student && <dl className="export-student"><div><dt>地區</dt><dd>{student.region}</dd></div><div><dt>補習班</dt><dd>{student.institution}</dd></div><div><dt>班級</dt><dd>{student.className}</dd></div><div><dt>姓名</dt><dd>{student.name}</dd></div></dl>}</header>;
}
export function ExportSection({ kind, title, children }: { kind: "question" | "answer" | "concept" | "options" | "diagram"; title: string; children: ReactNode }) {
  return <section className={`export-section export-section-${kind}`}><h3>{title}</h3><div className="export-section-body">{children}</div></section>;
}
