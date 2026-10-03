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
    const animation = node.animate([
      { left: `${snapshot.rect.left}px`, top: `${snapshot.rect.top}px`, width: `${snapshot.rect.width}px`, height: `${snapshot.rect.height}px`, borderRadius: "20px", opacity: 1 },
      { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`, borderRadius: "18px", opacity: 1, offset: 0.84 },
      { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`, borderRadius: "18px", opacity: 0 },
    ], { duration: 520, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "both" });
    animation.onfinish = () => done.current();
    return () => animation.cancel();
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
  </div>, document.body);
}
