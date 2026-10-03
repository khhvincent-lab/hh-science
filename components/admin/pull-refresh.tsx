"use client";

import { useEffect, useRef, useState } from "react";
import "./pull-refresh.css";

export default function AdminPullRefresh({ onRefresh, busy }: {
  onRefresh: () => Promise<void>; busy: boolean;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  const [distance, setDistance] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const root = anchor.current?.closest(".admin-main");
    if (!(root instanceof HTMLElement)) return;
    let start: { x: number; y: number } | null = null;
    let pulled = 0;
    let locked = false;
    const reset = () => { start = null; pulled = 0; setDistance(0); };
    const atTop = (target: HTMLElement) => {
      if ((document.scrollingElement?.scrollTop || 0) > 1) return false;
      for (let el: HTMLElement | null = target; el; el = el.parentElement) {
        if (el.scrollTop > 1) return false;
      }
      return true;
    };
    const begin = (event: TouchEvent) => {
      reset();
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (busy || locked || event.touches.length !== 1 || !target || !atTop(target)) return;
      if (target.closest('input,textarea,select,button,a,[contenteditable="true"],[role="dialog"]') || document.querySelector('[aria-modal="true"]')) return;
      setFailed(false);
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const move = (event: TouchEvent) => {
      if (!start) return;
      if (event.touches.length !== 1) { reset(); return; }
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (dy < 0 || (Math.abs(dx) > 10 && Math.abs(dx) > dy)) { reset(); return; }
      if (dy < 8) return;
      if (!event.cancelable) { reset(); return; }
      event.preventDefault();
      pulled = Math.min(92, dy * 0.5);
      setDistance(pulled);
    };
    const end = () => {
      const shouldRefresh = pulled >= 56;
      reset();
      if (!shouldRefresh || busy || locked) return;
      locked = true;
      void onRefresh().catch(() => setFailed(true)).finally(() => { locked = false; });
    };
    root.addEventListener("touchstart", begin, { passive: true });
    root.addEventListener("touchmove", move, { passive: false });
    root.addEventListener("touchend", end);
    root.addEventListener("touchcancel", reset);
    const oldOverscroll = document.documentElement.style.overscrollBehaviorY;
    document.documentElement.style.overscrollBehaviorY = "none";
    return () => {
      root.removeEventListener("touchstart", begin);
      root.removeEventListener("touchmove", move);
      root.removeEventListener("touchend", end);
      root.removeEventListener("touchcancel", reset);
      document.documentElement.style.overscrollBehaviorY = oldOverscroll;
    };
  }, [onRefresh, busy]);
  const label = busy ? "正在更新資料…" : failed ? "更新失敗，請再試一次" : distance >= 56 ? "放開即可更新" : "在頁面頂端下拉更新";
  return <div ref={anchor} className={`admin-pull-refresh${busy ? " is-busy" : ""}${distance ? " is-pulling" : ""}`} style={{ height: busy ? 56 : 26 + distance * 0.5 }} role="status" aria-live="polite">
    <span className="admin-pull-refresh-icon" aria-hidden="true" style={{ transform: `rotate(${distance >= 56 ? 180 : 0}deg)` }}>{busy ? "↻" : "↓"}</span><span>{label}</span>
  </div>;
}
