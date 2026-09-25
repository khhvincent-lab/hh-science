"use client";

import { useEffect, useRef, useState } from "react";

export default function SolveProgress({ accepted, completed, createdAt, connectionError }: {
  accepted: boolean;
  completed: boolean;
  createdAt?: string;
  connectionError: string;
}) {
  const [progress, setProgress] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const started = useRef(0);
  const wasWorking = useRef(false);

  useEffect(() => {
    if (completed) {
      if (!wasWorking.current) return;
      wasWorking.current = false;
      started.current = 0;
      setProgress(100);
      setFinishing(true);
      const timer = window.setTimeout(() => setFinishing(false), 1100);
      return () => window.clearTimeout(timer);
    }
    wasWorking.current = true;
    setFinishing(false);
    if (!started.current) {
      started.current = Date.now();
      setProgress(0);
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
          : 95 + Math.min(4, (seconds - 30) / 15)
        : 9 * (1 - Math.exp(-seconds / 5));
      setProgress(previous => Math.max(previous, Math.min(99, estimate)));
    }
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [accepted, completed, createdAt]);

  if (completed && !finishing) return null;
  // Tenths make the slow final stretch visible without claiming completion.
  const percentage = completed ? 100 : progress >= 95 ? Math.floor(progress * 10) / 10 : Math.floor(progress);
  const percentageLabel = !completed && progress >= 95 ? percentage.toFixed(1) : String(percentage);
  return <div className={`solve-progress-card ${completed ? "solve-progress-complete" : "student-solving-card-v11"}`}>
    {!completed && <div className="student-solving-ring" aria-hidden="true"><span /></div>}
    <p className="solve-progress-title" role="status">{completed ? "解析已完成" : accepted ? "已送出題目，分析題目中" : "正在送出題目，請保持頁面開啟"}</p>
    <div className="solve-progress-meter">
      <div className="solve-progress-caption"><span>{completed ? "解題完成" : "解題進度"}</span><span>{percentageLabel}%</span></div>
      <div className="solve-progress-track" role="progressbar" aria-label="解題進度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={completed ? "解題完成，100%" : `${percentageLabel}%，仍在處理中`}>
        <span className="solve-progress-fill" style={{ transform: `scaleX(${completed ? 1 : progress / 100})` }} />
      </div>
    </div>
    {!completed && <>
      <p className="solve-progress-help">{accepted ? <>任務已建立，可以離開頁面。<br />回來後會自動恢復進度。</> : "圖片送出並取得任務編號後，就可以離開頁面。"}</p>
      {connectionError && <p role="status" className="solve-progress-help">{connectionError}</p>}
    </>}
  </div>;
}
