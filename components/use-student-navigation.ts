"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type View = "solve" | "result" | "history";
type Motion = "tabs" | "forward" | "back";
const order: Record<View, number> = { solve: 0, result: 1, history: 2 };

const selectors: Record<View, string> = {
  solve: ".student-welcome-card, .student-workspace",
  result: ".v2-result-navigation, .student-result-panel",
  history: ".student-history-shell",
};
const duration = 320;
const easing = "cubic-bezier(.22,.75,.22,1)";

// A short-lived, inert visual layer lets the old page leave without delaying state or requests.
export function useStudentNavigation(detailKey: string, resultStage: string, owner: string) {
  const [view, commitView] = useState<View>("solve");
  const current = useRef<View>("solve");
  const positions = useRef<Record<string, number>>({});
  const motion = useRef({ x: 0, y: 28 });
  const outgoing = useRef<HTMLElement | null>(null);
  const animations = useRef<Animation[]>([]);
  const previous = useRef("");
  const ownerRef = useRef(owner);
  const key = view === "history" ? `history:${detailKey}` : view;
  const keyRef = useRef(key);

  const clearMotion = useCallback(() => {
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    outgoing.current?.remove();
    outgoing.current = null;
  }, []);

  const captureOutgoing = useCallback(() => {
    clearMotion();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = document.querySelector<HTMLElement>("main.student-page");
    const container = page?.querySelector<HTMLElement>(".student-container");
    if (!page || !container) return;
    const layer = page.cloneNode(false) as HTMLElement;
    layer.removeAttribute("id");
    layer.classList.add("student-motion-outgoing");
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    const surface = container.cloneNode(false) as HTMLElement;
    surface.style.cssText = "position:static!important;margin:0!important;padding:0!important;width:auto!important;max-width:none!important;";
    layer.appendChild(surface);
    container.querySelectorAll<HTMLElement>(selectors[current.current]).forEach(element => {
      const rect = element.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      const copy = element.cloneNode(true) as HTMLElement;
      copy.removeAttribute("id");
      copy.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
      copy.querySelectorAll("input, select, textarea, button").forEach(node => node.removeAttribute("name"));
      copy.querySelectorAll("[autofocus]").forEach(node => node.removeAttribute("autofocus"));
      copy.style.cssText += `;position:absolute!important;left:${rect.left}px!important;top:${rect.top}px!important;width:${rect.width}px!important;height:${rect.height}px!important;margin:0!important;max-width:none!important;transform:none!important;`;
      surface.appendChild(copy);
    });
    if (!surface.childElementCount) return;
    document.body.appendChild(layer);
    outgoing.current = layer;
  }, [clearMotion]);

  const navigate = useCallback((next: View, kind: Motion = "tabs") => {
    if (next === current.current) return;
    positions.current[keyRef.current] = window.scrollY;
    captureOutgoing();
    motion.current = kind === "tabs"
      ? { x: (order[next] > order[current.current] ? 1 : -1) * 32, y: 0 }
      : { x: 0, y: kind === "forward" ? 28 : -28 };
    current.current = next;
    commitView(next);
  }, [captureOutgoing]);

  // Save before changing history detail state, while the list still has its height.
  const rememberPosition = useCallback(() => {
    positions.current[keyRef.current] = window.scrollY;
    captureOutgoing();
  }, [captureOutgoing]);

  useLayoutEffect(() => {
    if (ownerRef.current !== owner) {
      clearMotion();
      positions.current = {};
      previous.current = "";
      ownerRef.current = owner;
    }
    const stageKey = `${key}:${view === "result" ? resultStage : ""}`;
    if (previous.current === stageKey) {
      if (outgoing.current) clearMotion();
      return;
    }
    const wasMounted = Boolean(previous.current);
    const changedPage = keyRef.current !== key;
    const historyDetailChanged = changedPage && key.startsWith("history:") && keyRef.current.startsWith("history:");
    keyRef.current = key;
    previous.current = stageKey;
    if (!wasMounted) return;
    if (changedPage) {
      window.scrollTo({ top: positions.current[key] ?? 0, behavior: "instant" });
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { clearMotion(); return; }
    const offset = historyDetailChanged || !changedPage
      ? { x: 0, y: detailKey === "list" && historyDetailChanged ? -28 : 28 }
      : motion.current;
    // Only animate live content; the outgoing layer is separately scoped and never interactive.
    const layer = outgoing.current;
    if (layer) {
      const exitAnimation = layer.animate([
        { opacity: 1, transform: "translate3d(0,0,0)" },
        { opacity: 0, transform: `translate3d(${-offset.x}px, ${-offset.y}px, 0)` },
      ], { duration, easing, fill: "forwards" });
      animations.current.push(exitAnimation);
      exitAnimation.finished.then(() => {
        layer.remove();
        if (outgoing.current === layer) outgoing.current = null;
      }).catch(() => layer.remove());
    } else {
      animations.current.forEach(animation => animation.cancel());
      animations.current = [];
    }
    const selector = selectors[view];
    document.querySelector("main.student-page:not(.student-motion-outgoing)")?.querySelectorAll<HTMLElement>(selector).forEach(element => {
      animations.current.push(element.animate([
        { opacity: 0.15, transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ], { duration, easing }));
    });
  }, [key, view, detailKey, resultStage, owner, clearMotion]);

  useLayoutEffect(() => clearMotion, [clearMotion]);
  return { view, navigate, rememberPosition };
}
