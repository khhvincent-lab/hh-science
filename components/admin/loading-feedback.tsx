"use client";

import { useEffect, useState, type ReactNode } from "react";
import AdaptiveBrandLogo from "@/components/adaptive-brand-logo";
import "./loading-feedback.css";

function useSlowRequest() {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setSlow(true), 10000); return () => window.clearTimeout(timer); }, []);
  return slow;
}

export function AdminLoginLoading({ label = "正在確認登入狀態…" }: { label?: string }) {
  const slow = useSlowRequest();
  return <main className="admin-access-screen" aria-busy="true">
    <section className="admin-access-card">
      <div className="admin-access-scan" aria-hidden="true" />
      <div className="admin-access-caption">TEACHING CONTROL CENTER</div>
      <div className="admin-access-emblem" aria-hidden="true"><i /><i /><AdaptiveBrandLogo size={76} /></div>
      <h1>解題實驗室</h1><p className="admin-access-english">Science Lab</p>
      <div className="admin-access-status" role="status"><LoadingLabel>{label}</LoadingLabel></div>
      <div className="admin-access-track" aria-hidden="true"><i /></div>
      <small>{slow ? "連線時間較長，請稍候…" : "教師與管理員專屬工作台"}</small>
    </section>
  </main>;
}

export function LoadingLabel({ children = "儲存中…" }: { children?: ReactNode }) {
  return <span className="admin-loading-label"><span className="admin-mini-ring" aria-hidden="true" />{children}</span>;
}

/** Mount only while a real request is pending; no fabricated percentages or minimum wait. */
export function AdminLoading({ label = "正在讀取資料…", skeleton = false }: { label?: string; skeleton?: boolean }) {
  const slow = useSlowRequest();
  return <div className={`admin-fetch-feedback ${skeleton ? "admin-fetch-skeleton" : ""}`} role="status" aria-live="polite" aria-busy="true">
    <div className="admin-fetch-line" aria-hidden="true" />
    <span className="admin-fetch-caption"><span className="admin-fetch-dots" aria-hidden="true"><i /><i /><i /></span>{label}</span>
    {skeleton && <div className="admin-skeleton-grid" aria-hidden="true">{[0, 1, 2, 3].map(i => <div key={i}><i /><b /><i /></div>)}<section><i /><i /><i /></section></div>}
    {slow && <small className="admin-fetch-slow">資料載入時間較長，請稍候。<button type="button" onClick={() => window.location.reload()}>重新載入頁面</button></small>}
  </div>;
}
