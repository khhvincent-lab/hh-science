"use client";
import { useLayoutEffect, useState, type ReactNode } from "react";

type Phase = "working" | "hold" | "collapse" | "reveal" | "ready";
export default function SolvePresentation({ working, completed, progress, children }: {
  working: boolean; completed: boolean; progress: ReactNode; children: ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>(working ? "working" : "ready");
  const status = working ? "working" : completed ? "complete" : "empty";
  const [previousStatus, setPreviousStatus] = useState(status);
  if (status !== previousStatus) {
    setPreviousStatus(status);
    const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setPhase(status === "working" ? "working" : status === "complete" && previousStatus === "working" && !reduced ? "hold" : "ready");
  }
  useLayoutEffect(() => {
    const next: Partial<Record<Phase, Phase>> = { hold: "collapse", collapse: "reveal", reveal: "ready" };
    const nextPhase = next[phase];
    if (!nextPhase) return;
    const timer = window.setTimeout(() => setPhase(nextPhase), phase === "hold" ? 160 : 500);
    return () => window.clearTimeout(timer);
  }, [phase]);
  const showResult = completed && (phase === "reveal" || phase === "ready");
  const showProgress = working || phase === "hold" || phase === "collapse";
  return <div className="solve-presentation" data-phase={phase}>
    {showProgress && <div className="solve-progress-fold" data-open={phase !== "collapse"}>
      <div className="solve-fold-inner">{progress}</div>
    </div>}
    {completed && <div className="solve-result-unfold" data-open={showResult} aria-hidden={!showResult} inert={!showResult}>
      <div className="solve-fold-inner">{children}</div>
    </div>}
  </div>;
}
