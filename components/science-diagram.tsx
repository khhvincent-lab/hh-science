"use client";

import { useId, useState } from "react";
import type { ScienceDiagram, ScienceDiagramPrimitive } from "@/lib/ai/types";

function clamp(value: number | undefined, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function roleClass(role: ScienceDiagramPrimitive["role"] | undefined) {
  if (role === "accent") return "science-diagram-accent";
  if (role === "secondary") return "science-diagram-secondary";
  if (role === "muted") return "science-diagram-muted";
  return "science-diagram-primary";
}

function arcPath(item: ScienceDiagramPrimitive) {
  const cx = clamp(item.cx, 50);
  const cy = clamp(item.cy, 50);
  const r = Math.max(1, clamp(item.r, 10));
  const start = Number.isFinite(Number(item.startAngle)) ? Number(item.startAngle) : 0;
  const end = Number.isFinite(Number(item.endAngle)) ? Number(item.endAngle) : 90;
  const toPoint = (degree: number) => {
    const rad = (degree * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const p1 = toPoint(start);
  const p2 = toPoint(end);
  const delta = Math.abs(end - start) % 360;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${delta > 180 ? 1 : 0} ${end >= start ? 1 : 0} ${p2.x} ${p2.y}`;
}

function Primitive({ item, markerId, index, onSelect }: { item: ScienceDiagramPrimitive; markerId: string; index: number; onSelect: (item: ScienceDiagramPrimitive) => void }) {
  const cls = `${roleClass(item.role)}${item.dashed ? " science-diagram-dashed" : ""}${item.note ? " science-diagram-clickable" : ""}`;
  const select = item.note ? () => onSelect(item) : undefined;
  const label = (x: number, y: number) => item.text ? <text className={`${roleClass(item.role)} science-diagram-label`} x={x} y={y - 2}>{String(item.text).slice(0, 48)}</text> : null;

  if (item.kind === "line" || item.kind === "arrow") {
    const x1 = clamp(item.x1), y1 = clamp(item.y1), x2 = clamp(item.x2), y2 = clamp(item.y2);
    return <g key={index} onClick={select} className={item.note ? "science-diagram-group-clickable" : undefined}><line className={cls} x1={x1} y1={y1} x2={x2} y2={y2} markerEnd={item.kind === "arrow" ? `url(#${markerId})` : undefined} />{label((x1+x2)/2,(y1+y2)/2)}</g>;
  }
  if (item.kind === "circle") {
    const cx = clamp(item.cx), cy = clamp(item.cy);
    return <g key={index} onClick={select} className={item.note ? "science-diagram-group-clickable" : undefined}><circle className={cls} cx={cx} cy={cy} r={Math.max(1, clamp(item.r, 6))} />{label(cx,cy)}</g>;
  }
  if (item.kind === "rect") {
    const x = clamp(item.x), y = clamp(item.y), width = Math.max(1,clamp(item.width,10)), height = Math.max(1,clamp(item.height,10));
    return <g key={index} onClick={select} className={item.note ? "science-diagram-group-clickable" : undefined}><rect className={cls} x={x} y={y} width={width} height={height} rx="2" />{label(x+width/2,y+height/2)}</g>;
  }
  if (item.kind === "polyline") {
    const points = (item.points || []).map((p) => `${clamp(p.x)},${clamp(p.y)}`).join(" ");
    return points ? <polyline key={index} className={cls} points={points} fill="none" onClick={select} /> : null;
  }
  if (item.kind === "arc") {
    return <path key={index} className={cls} d={arcPath(item)} fill="none" onClick={select} />;
  }
  if (item.kind === "label") {
    return <text key={index} onClick={select} className={`${cls} science-diagram-label`} x={clamp(item.x,50)} y={clamp(item.y,50)}>{String(item.text || "").slice(0,48)}</text>;
  }
  return null;
}

export default function ScienceDiagramView({ diagram, compact = false }: { diagram?: ScienceDiagram | null; compact?: boolean }) {
  const rawId = useId();
  const markerId = `science-arrow-${rawId.replace(/[:]/g, "")}`;
  const [selected, setSelected] = useState<ScienceDiagramPrimitive | null>(null);
  if (!diagram || !Array.isArray(diagram.primitives) || diagram.primitives.length < 2) return null;

  return (
    <figure className={`science-diagram-card${compact ? " science-diagram-compact" : ""}`}>
      <div className="science-diagram-heading"><div><span>SCIENCE DIAGRAM</span><strong>{diagram.title || "科學圖解"}</strong></div><small>{diagram.type.replaceAll("_", " ")}</small></div>
      <svg className="science-diagram-svg" viewBox="0 0 100 100" role="img" aria-label={diagram.title || "科學圖解"}>
        <defs><marker id={markerId} markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L5,2.5 L0,5 Z" className="science-diagram-marker" /></marker></defs>
        {diagram.primitives.map((item,index)=><Primitive key={index} item={item} markerId={markerId} index={index} onSelect={setSelected} />)}
      </svg>
      {selected?.note ? <div className="science-diagram-note"><strong>{selected.text || "圖解重點"}</strong><span>{selected.note}</span><button type="button" onClick={()=>setSelected(null)} aria-label="關閉圖解說明">×</button></div> : null}
      {diagram.caption ? <figcaption>{diagram.caption}</figcaption> : null}
      <style jsx global>{`
        .science-diagram-card{margin:14px 0;padding:14px;border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--surface) 92%,var(--primary) 8%);overflow:hidden}.science-diagram-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}.science-diagram-heading>div{display:grid;gap:3px}.science-diagram-heading span{font-size:8px;letter-spacing:.18em;color:var(--text-muted);font-weight:900}.science-diagram-heading strong{font-size:13px;color:var(--text)}.science-diagram-heading small{font-size:8px;color:var(--text-muted);text-transform:uppercase}.science-diagram-svg{display:block;width:100%;height:auto;max-height:350px;aspect-ratio:16/10;border-radius:13px;background:color-mix(in srgb,var(--surface-soft) 96%,transparent);overflow:visible}.science-diagram-primary,.science-diagram-secondary,.science-diagram-accent,.science-diagram-muted{vector-effect:non-scaling-stroke;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round;fill:none}.science-diagram-primary{stroke:var(--text)}.science-diagram-secondary{stroke:var(--text-secondary)}.science-diagram-accent{stroke:var(--primary)}.science-diagram-muted{stroke:var(--text-muted)}.science-diagram-dashed{stroke-dasharray:3 2}.science-diagram-label{font-size:4.1px;font-weight:800;dominant-baseline:middle;stroke:none;fill:var(--text);user-select:none}.science-diagram-secondary.science-diagram-label{fill:var(--text-secondary)}.science-diagram-accent.science-diagram-label{fill:var(--primary)}.science-diagram-muted.science-diagram-label{fill:var(--text-muted)}.science-diagram-marker{fill:var(--text);stroke:none}.science-diagram-group-clickable,.science-diagram-clickable{cursor:pointer}.science-diagram-note{position:relative;display:grid;gap:3px;margin-top:8px;padding:9px 36px 9px 10px;border:1px solid color-mix(in srgb,var(--primary) 30%,var(--border));border-radius:11px;background:color-mix(in srgb,var(--primary) 8%,var(--surface));}.science-diagram-note strong{font-size:10px}.science-diagram-note span{font-size:9.5px;line-height:1.5;color:var(--text-secondary)}.science-diagram-note button{position:absolute;right:8px;top:7px;border:0;background:transparent;color:var(--text-secondary);font-size:16px;cursor:pointer}.science-diagram-card figcaption{margin-top:8px;font-size:9.5px;line-height:1.55;color:var(--text-secondary)}.science-diagram-compact{padding:10px;border-radius:14px}.science-diagram-compact .science-diagram-heading strong{font-size:11px}.science-diagram-compact .science-diagram-svg{max-height:220px}@media(max-width:640px){.science-diagram-card{padding:11px;border-radius:15px}.science-diagram-svg{aspect-ratio:4/3;max-height:300px}.science-diagram-heading small{display:none}.science-diagram-label{font-size:4.5px}}
      `}</style>
    </figure>
  );
}
