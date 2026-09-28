"use client";

import { useEffect, useRef, useState } from "react";

export default function SolveProgress({ accepted, completed, createdAt, connectionError }: {
  accepted: boolean;
  completed: boolean;
  createdAt?: string;
  connectionError: string;
}) {
  const [progress, setProgress] = useState(0);
  const started = useRef(0);

  useEffect(() => {
    if (completed) { started.current = 0; return; }
    if (!started.current) {
      started.current = Date.now();
    }
    // This is an estimated reading indicator, not a measured work percentage.
    // Recover from the server timestamp and never reach 100 before success.
    const serverStart = createdAt ? Date.parse(createdAt) : NaN;
    const origin = accepted && Number.isFinite(serverStart) ? Math.min(Date.now(), serverStart) : started.current;
    function tick() {
      const seconds = Math.max(0, (Date.now() - origin) / 1000);
      const estimate = accepted
        ? seconds < 30
          ? 10 + 85 * (1 - Math.pow(1 - seconds / 30, 2))
          : 95 + Math.min(4, (seconds - 30) / 3)
        : 9 * (1 - Math.exp(-seconds / 5));
      setProgress(previous => Math.max(previous, Math.min(99, estimate)));
    }
    const firstTick = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 250);
    return () => { window.clearTimeout(firstTick); window.clearInterval(timer); };
  }, [accepted, completed, createdAt]);

  const percentage = completed ? 100 : Math.floor(progress);
  return <div className="solve-progress-card student-solving-card-v11" data-completed={completed}>
    <div className="student-solving-ring" aria-hidden="true" style={completed ? { visibility: "hidden" } : undefined}><span /></div>
    <p className="solve-progress-title" role="status">{completed ? "解析已完成" : accepted ? "已送出題目，分析題目中" : "正在送出題目，請保持頁面開啟"}</p>
    <div className="solve-progress-meter">
      <div className="solve-progress-caption"><span>{completed ? "解題完成" : "解題進度"}</span><span>{percentage}%</span></div>
      <div className="solve-progress-track" role="progressbar" aria-label="解題進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={completed ? "解題完成，100%" : `${percentage}%，仍在處理中`}>
        <span className="solve-progress-fill" style={{ transform: `scaleX(${completed ? 1 : progress / 100})` }} />
      </div>
    </div>
    <div style={completed ? { visibility: "hidden" } : undefined}>
      <p className="solve-progress-help">{accepted || completed ? <>任務已建立，可以離開頁面。<br />回來後會自動恢復進度。</> : "圖片送出並取得任務編號後，就可以離開頁面。"}</p>
      {connectionError && <p role="status" className="solve-progress-help">{connectionError}</p>}
    </div>
  </div>;
}
