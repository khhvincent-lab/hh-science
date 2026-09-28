"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

type View = "solve" | "result" | "history";
type Motion = "tabs" | "forward" | "back";
const order: Record<View, number> = { solve: 0, result: 1, history: 2 };

// Animate existing elements: no extra layout wrappers, screenshots, or delayed requests.
export function useStudentNavigation(detailKey: string, resultStage: string, owner: string) {
  const [view, commitView] = useState<View>("solve");
  const current = useRef<View>("solve");
  const positions = useRef<Record<string, number>>({});
  const motion = useRef({ x: 0, y: 10 });
  const animations = useRef<Animation[]>([]);
  const previous = useRef("");
  const ownerRef = useRef(owner);
  const key = view === "history" ? `history:${detailKey}` : view;
  const keyRef = useRef(key);

  const navigate = useCallback((next: View, kind: Motion = "tabs") => {
    if (next === current.current) return;
    positions.current[keyRef.current] = window.scrollY;
    motion.current = kind === "tabs"
      ? { x: (order[next] > order[current.current] ? 1 : -1) * 10, y: 0 }
      : { x: 0, y: kind === "forward" ? 10 : -8 };
    current.current = next;
    commitView(next);
  }, []);

  // Save before changing history detail state, while the list still has its height.
  const rememberPosition = useCallback(() => {
    positions.current[keyRef.current] = window.scrollY;
  }, []);

  useLayoutEffect(() => {
    if (ownerRef.current !== owner) {
      positions.current = {};
      previous.current = "";
      ownerRef.current = owner;
    }
    const stageKey = `${key}:${view === "result" ? resultStage : ""}`;
    if (previous.current === stageKey) return;
    const wasMounted = Boolean(previous.current);
    const changedPage = keyRef.current !== key;
    const historyDetailChanged = changedPage && key.startsWith("history:") && keyRef.current.startsWith("history:");
    keyRef.current = key;
    previous.current = stageKey;
    animations.current.forEach(animation => animation.cancel());
    animations.current = [];
    if (!wasMounted) return;
    if (changedPage) {
      window.scrollTo({ top: positions.current[key] ?? 0, behavior: "instant" });
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const offset = historyDetailChanged || !changedPage
      ? { x: 0, y: detailKey === "list" && historyDetailChanged ? -8 : 10 }
      : motion.current;
    const selector = view === "solve"
      ? ".student-welcome-card, .student-workspace"
      : view === "history" ? ".student-history-shell"
      : ".v2-result-navigation, .student-result-panel";
    document.querySelectorAll<HTMLElement>(selector).forEach(element => {
      animations.current.push(element.animate([
        { opacity: 0.45, transform: `translate3d(${offset.x}px, ${offset.y}px, 0)` },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ], { duration: offset.x ? 200 : 240, easing: "cubic-bezier(.22,.7,.25,1)" }));
    });
  }, [key, view, detailKey, resultStage, owner]);

  useLayoutEffect(() => () => animations.current.forEach(animation => animation.cancel()), []);
  return { view, navigate, rememberPosition };
}
