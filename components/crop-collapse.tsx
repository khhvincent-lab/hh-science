"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

export type CropCollapseSnapshot = { image: string; rect: DOMRect };

export default function CropCollapse({ snapshot, target, onDone }: {
  snapshot: CropCollapseSnapshot;
  target: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  const overlay = useRef<HTMLDivElement>(null);
  const scan = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  useLayoutEffect(() => { done.current = onDone; }, [onDone]);

  useLayoutEffect(() => {
    const node = overlay.current;
    const panel = target.current;
    if (!node || !panel || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done.current();
      return;
    }
    // Measure the compact panel after React has committed the cropped thumbnail.
    const bounds = panel.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) {
      panel.scrollIntoView({ block: "start", behavior: "instant" });
    }
    const end = panel.getBoundingClientRect();
    const startFrame = { left: `${snapshot.rect.left}px`, top: `${snapshot.rect.top}px`, width: `${snapshot.rect.width}px`, height: `${snapshot.rect.height}px`, borderRadius: "20px", opacity: 1 };
    const endFrame = { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`, borderRadius: "18px" };
    const animation = node.animate([
      { ...startFrame, offset: 0 },
      { ...startFrame, offset: 0.12, easing: "cubic-bezier(.65, 0, .2, 1)" },
      { ...endFrame, opacity: 1, offset: 0.84, easing: "ease-out" },
      { ...endFrame, opacity: 0, offset: 1 },
    ], { duration: 960, easing: "linear", fill: "both" });
    // A single upward light sweep follows the image into the compact panel.
    const sweep = scan.current?.animate([
      { transform: "translateY(75%)", opacity: 0, offset: 0 },
      { transform: "translateY(55%)", opacity: 0.7, offset: 0.18 },
      { transform: "translateY(-65%)", opacity: 0, offset: 1 },
    ], { duration: 900, easing: "cubic-bezier(.4, 0, .2, 1)", fill: "both" });
    const glow = node.animate([
      { boxShadow: "0 16px 48px #0003, inset 0 0 0 1px transparent" },
      { boxShadow: "0 12px 36px #0003, inset 0 0 0 1px var(--primary), inset 0 0 22px color-mix(in srgb, var(--primary) 16%, transparent)", offset: 0.32 },
      { boxShadow: "0 4px 14px #0001, inset 0 0 0 1px transparent" },
    ], { duration: 960, easing: "ease-in-out", fill: "both" });
    animation.onfinish = () => done.current();
    return () => { animation.cancel(); sweep?.cancel(); glow.cancel(); };
  }, [snapshot, target]);

  return createPortal(<div ref={overlay} aria-hidden="true" style={{
    position: "fixed", zIndex: 350, pointerEvents: "none", overflow: "hidden",
    left: snapshot.rect.left, top: snapshot.rect.top, width: snapshot.rect.width,
    height: snapshot.rect.height, padding: 14, boxSizing: "border-box",
    background: "var(--surface)", border: "1px solid var(--border)",
    boxShadow: "0 16px 48px #0003",
  }}>
    {/* Cropped data URLs stay local and do not use the remote image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={snapshot.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 12 }} />
    <div ref={scan} style={{
      position: "absolute", inset: 0, pointerEvents: "none", opacity: 0,
      background: "linear-gradient(to top, transparent 38%, color-mix(in srgb, var(--primary) 12%, transparent) 48%, color-mix(in srgb, var(--primary) 65%, transparent) 50%, transparent 51%)",
    }} />
  </div>, document.body);
}
