"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import AdaptiveBrandLogo from "./adaptive-brand-logo";
import "./lab-startup.css";

export default function LabStartup({ loading, authenticated, onResume, children }: {
  onResume?: () => void; loading: boolean; authenticated: boolean; name: string; englishName: string; children: ReactNode;
}) {
  const resumeCallback = useRef(onResume);
  resumeCallback.current = onResume;
  const [cycle, setCycle] = useState(0);
  const [phase, setPhase] = useState("loading");
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let hidden = document.visibilityState === "hidden";
    const resume = () => {
      if (document.visibilityState === "hidden") { hidden = true; return; }
      if (hidden) { hidden = false; resumeCallback.current?.(); setPhase("loading"); setCycle(value => value + 1); }
    };
    const pageshow = (event: PageTransitionEvent) => { if (event.persisted) { resumeCallback.current?.(); setPhase("loading"); setCycle(value => value + 1); } };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", pageshow);
    return () => { document.removeEventListener("visibilitychange", resume); window.removeEventListener("pageshow", pageshow); };
  }, []);

  useEffect(() => {
    if (loading) {
      const reset = window.setTimeout(() => setPhase("loading"), 0);
      return () => window.clearTimeout(reset);
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const racing = document.documentElement.dataset.theme?.startsWith("f1-");
    const timers = [
      ...(racing ? [window.setTimeout(() => setPhase("four"), reduced ? 60 : 350)] : []),
      window.setTimeout(() => setPhase("ready"), racing ? (reduced ? 120 : 700) : (reduced ? 0 : 650)),
      window.setTimeout(() => setPhase("enter"), racing ? (reduced ? 180 : 1050) : (reduced ? 100 : 1050)),
      window.setTimeout(() => setPhase("done"), racing ? (reduced ? 350 : 2000) : (reduced ? 250 : 2000)),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [loading, cycle]);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setTimeout(() => setSlow(true), 8000);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const active = phase !== "done" || loading;
  return <>
    <div className={`lab-startup-content ${active ? "lab-startup-covered" : ""} ${phase === "enter" ? "lab-startup-reveal" : ""}`} inert={active} aria-hidden={active || undefined}>
      {!loading && children}
    </div>
    {active && <div className={`lab-startup lab-startup-${loading ? "loading" : phase}`} role="status" aria-live="polite" aria-label="實驗室啟動">
      <div className="lab-startup-grid" />
      <div className="lab-startup-center">
        <div className="lab-startup-core">
          <div className="lab-startup-ring" /><div className="lab-startup-orbit" /><div className="lab-startup-orbit lab-startup-outer" />
          <div className="lab-startup-mark"><AdaptiveBrandLogo size={94} /></div>
          {[0, 1, 2, 3].map(i => <span key={i} className={`lab-startup-particle lab-startup-particle-${i}`} />)}
        </div>
        <div className="lab-startup-copy">
          <div className="f1-start-lights" aria-hidden="true" data-lit={loading || phase === "loading" ? 3 : phase === "four" ? 4 : 5}>
            {[0, 1, 2, 3, 4].map(i => <span key={i} className={i < (loading || phase === "loading" ? 3 : phase === "four" ? 4 : 5) ? "is-lit" : ""} />)}
          </div>
          <h1>解題實驗室</h1><p>Science Lab</p><div className="lab-startup-status">{loading ? (slow ? "連線時間較長，請稍候…" : "正在確認登入狀態…") : phase === "loading" || phase === "four" ? "正在啟動實驗室…" : authenticated ? "實驗室已就緒" : "歡迎進入實驗室"}</div>
        {loading && slow && <button type="button" onClick={() => window.location.reload()}>重新嘗試</button>}
        </div>
      </div>
    </div>}
  </>;
}
