"use client";

import { useMemo, useState } from "react";
import type { ChemicalStructure, ChemicalAtom, ChemicalBond } from "@/lib/ai/types";

function clamp(value: unknown, fallback = 50) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(95, n));
}

function bondLines(a: ChemicalAtom, b: ChemicalAtom, order: ChemicalBond["order"]) {
  const x1 = clamp(a.x), y1 = clamp(a.y), x2 = clamp(b.x), y2 = clamp(b.y);
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ox = (-dy / len) * 1.4, oy = (dx / len) * 1.4;
  const count = order === 3 ? 3 : order === 2 || order === "aromatic" ? 2 : 1;
  const offsets = count === 1 ? [0] : count === 2 ? [-0.7, 0.7] : [-1.2, 0, 1.2];
  return offsets.map((factor, index) => (
    <line
      key={index}
      x1={x1 + ox * factor}
      y1={y1 + oy * factor}
      x2={x2 + ox * factor}
      y2={y2 + oy * factor}
      className={order === "aromatic" && index === 1 ? "chemical-bond chemical-bond-aromatic" : "chemical-bond"}
    />
  ));
}

function atomDisplay(atom: ChemicalAtom) {
  const label = String(atom.label || "C");
  const charge = String(atom.charge || "").trim();
  const hydrogens = Number(atom.hydrogens || 0);
  return { label, charge, hydrogens };
}

export default function ChemicalStructureView({ structure, compact = false }: { structure?: ChemicalStructure | null; compact?: boolean }) {
  const [selected, setSelected] = useState<ChemicalAtom | null>(null);
  const atomMap = useMemo(() => new Map((structure?.atoms || []).map(atom => [atom.id, atom])), [structure]);
  if (!structure || !Array.isArray(structure.atoms) || structure.atoms.length < 2) return null;

  return (
    <figure className={`chemical-structure-card${compact ? " chemical-structure-compact" : ""}`}>
      <div className="chemical-structure-heading">
        <div><span>CHEMICAL STRUCTURE</span><strong>{structure.title || "化學結構式"}</strong></div>
        <small>{structure.formula || structure.kind.replaceAll("_", " ")}</small>
      </div>
      <svg className="chemical-structure-svg" viewBox="0 0 100 100" role="img" aria-label={structure.title || "化學結構式"}>
        {(structure.bonds || []).map((bond, index) => {
          const a = atomMap.get(bond.from), b = atomMap.get(bond.to);
          if (!a || !b) return null;
          return <g key={`${bond.from}-${bond.to}-${index}`}>{bondLines(a, b, bond.order)}</g>;
        })}
        {structure.atoms.map((atom) => {
          const { label, charge, hydrogens } = atomDisplay(atom);
          const isCarbon = label === "C" && !atom.showLabel && !charge && hydrogens === 0;
          return (
            <g key={atom.id} className={atom.note ? "chemical-atom-clickable" : undefined} onClick={() => atom.note && setSelected(atom)}>
              {!isCarbon ? <circle cx={clamp(atom.x)} cy={clamp(atom.y)} r="4.4" className="chemical-atom-bg" /> : null}
              {!isCarbon ? <text x={clamp(atom.x)} y={clamp(atom.y)} className="chemical-atom-label">{label}</text> : null}
              {hydrogens > 0 ? <text x={clamp(atom.x) + 3.4} y={clamp(atom.y) + 4.4} className="chemical-atom-sub">H{hydrogens > 1 ? hydrogens : ""}</text> : null}
              {charge ? <text x={clamp(atom.x) + 3.6} y={clamp(atom.y) - 4.2} className="chemical-atom-charge">{charge}</text> : null}
            </g>
          );
        })}
      </svg>
      {selected?.note ? <div className="chemical-structure-note"><strong>{selected.label || "結構重點"}</strong><span>{selected.note}</span><button type="button" onClick={()=>setSelected(null)} aria-label="關閉說明">×</button></div> : null}
      {structure.caption ? <figcaption>{structure.caption}</figcaption> : null}
      <style jsx>{`
        .chemical-structure-card{margin:14px 0;padding:14px;border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--surface) 94%,var(--primary) 6%);overflow:hidden}.chemical-structure-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}.chemical-structure-heading>div{display:grid;gap:3px}.chemical-structure-heading span{font-size:8px;letter-spacing:.18em;color:var(--text-muted);font-weight:900}.chemical-structure-heading strong{font-size:13px;color:var(--text)}.chemical-structure-heading small{font-size:8px;color:var(--text-muted)}.chemical-structure-svg{display:block;width:100%;height:auto;max-height:340px;aspect-ratio:16/10;border-radius:13px;background:color-mix(in srgb,var(--surface-soft) 96%,transparent)}.chemical-bond{vector-effect:non-scaling-stroke;stroke:var(--text);stroke-width:1.35;stroke-linecap:round}.chemical-bond-aromatic{stroke-dasharray:2 1.5}.chemical-atom-bg{fill:var(--surface);stroke:none}.chemical-atom-label{font-size:5px;font-weight:900;fill:var(--text);text-anchor:middle;dominant-baseline:middle}.chemical-atom-sub,.chemical-atom-charge{font-size:2.8px;font-weight:800;fill:var(--text-secondary)}.chemical-atom-clickable{cursor:pointer}.chemical-structure-note{position:relative;display:grid;gap:3px;margin-top:8px;padding:9px 36px 9px 10px;border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));border-radius:11px;background:color-mix(in srgb,var(--primary) 8%,var(--surface))}.chemical-structure-note strong{font-size:10px}.chemical-structure-note span{font-size:9.5px;line-height:1.5;color:var(--text-secondary)}.chemical-structure-note button{position:absolute;right:8px;top:7px;border:0;background:transparent;color:var(--text-secondary);font-size:16px;cursor:pointer}.chemical-structure-card figcaption{margin-top:8px;font-size:9.5px;line-height:1.55;color:var(--text-secondary)}.chemical-structure-compact{padding:10px;border-radius:14px}.chemical-structure-compact .chemical-structure-svg{max-height:220px}@media(max-width:640px){.chemical-structure-card{padding:11px;border-radius:15px}.chemical-structure-svg{aspect-ratio:4/3;max-height:300px}.chemical-structure-heading small{display:none}}
      `}</style>
    </figure>
  );
}
