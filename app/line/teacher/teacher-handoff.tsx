"use client";
import Script from "next/script";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TEACHER_LIFF_ID, TEACHER_LIFF_URL } from "@/lib/line-liff";
import { getOfficialLineChatUrl } from "@/lib/official-line";

type Package = { text: string; imageUrl: string; previewUrl: string; expiresAt: string };
async function readPackage(token: string): Promise<Package> {
  const res = await fetch("/api/line/handoff", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store", signal: AbortSignal.timeout(20000) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "無法讀取交接。");
  return data;
}
export default function TeacherHandoff() {
  const [status, setStatus] = useState("正在連接 LINE…");
  const [token, setToken] = useState("");
  const [data, setData] = useState<Package | null>(null);
  const [canSend, setCanSend] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const initialized = useRef(false);
  const sending = useRef(false);
  const ready = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!ready.current) setStatus("LINE 連線較慢。請確認網路，或關閉此頁後從盧澔化學聊天室重新點交接連結。"); }, 25000);
    return () => window.clearTimeout(timer);
  }, []);
  async function initialize() {
    if (initialized.current || !window.liff) return;
    initialized.current = true;
    try {
      const liff = window.liff;
      await liff.init({ liffId: TEACHER_LIFF_ID });
      // LIFF must finish processing both redirects before reading URL parameters.
      const value = new URL(window.location.href).searchParams.get("handoff") || "";
      ready.current = true;
      if (!value) { setStatus("請先回解題實驗室，在解題結果按「轉接真人老師」，建立這一題的交接連結。"); return; }
      setToken(value);
      const info = await readPackage(value);
      setData(info);
      const grants = liff.isInClient() ? await liff.permission.getGrantedAll() : [];
      const allowed = liff.isInClient() && liff.getContext()?.type === "utou" && grants.includes("chat_message.write");
      setCanSend(allowed);
      setStatus(allowed ? "請確認內容與聊天室，再傳送給老師。" : "請從盧澔化學的一對一聊天室點交接連結，並同意傳送訊息權限。");
    } catch { ready.current = true; setStatus("無法完成 LINE 連線或交接讀取。請關閉此頁，從聊天室重新開啟最新連結；若已超過 24 小時，請回解題頁重新建立。"); }
  }
  async function send() {
    const liff = window.liff;
    if (!liff || !confirmed || !canSend || sent || sending.current) return;
    sending.current = true; setBusy(true);
    let attempted = false;
    try {
      if (!liff.isInClient() || liff.getContext()?.type !== "utou" || !(await liff.permission.getGrantedAll()).includes("chat_message.write")) throw new Error("請從盧澔化學聊天室重新開啟並同意傳送權限。");
      const fresh = await readPackage(token);
      attempted = true;
      await liff.sendMessages([{ type: "text", text: fresh.text }, { type: "image", originalContentUrl: fresh.imageUrl, previewImageUrl: fresh.previewUrl }]);
      setSent(true); setStatus("LINE 已接受傳送，請回聊天室確認文字與圖片。這不代表老師已讀。");
    } catch (err) {
      setStatus(attempted ? "尚未取得傳送成功確認。請先回聊天室檢查是否已有文字與圖片，避免重複傳送；確認沒有後再重試。" : (err instanceof Error ? err.message : "目前無法傳送，請稍後再試。"));
      setConfirmed(false);
    } finally { sending.current = false; setBusy(false); }
  }
  const link = `${TEACHER_LIFF_URL}?handoff=${encodeURIComponent(token)}`;
  const chat = getOfficialLineChatUrl(`老師您好，我想詢問這題。\n${link}\n學生請先送出，再點連結確認傳送圖片。`);
  return <main style={{ maxWidth: 640, margin: "0 auto", padding: "28px 18px 48px", minHeight: "100dvh" }}>
    <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" onReady={() => void initialize()} onError={() => { ready.current = true; setStatus("無法載入 LINE，請確認網路後重新開啟。"); }} />
    <div className="hh-card" style={{ padding: 22, display: "grid", gap: 18 }}>
      <header><p style={{ margin: "0 0 8px", fontSize: 13 }}>解題實驗室 · 真人導師</p><h1 style={{ fontSize: 25, margin: 0 }}>把這一題交給老師</h1></header>
      <p role="status" aria-live="polite" style={{ margin: 0 }}>{status}</p>
      {data && <>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit", margin: 0, lineHeight: 1.7 }}>{data.text}</pre>
        <details open><summary style={{ cursor: "pointer", marginBottom: 10 }}>完整題目與 AI 詳解圖片</summary>
          {/* Signed URLs must be fetched directly, not cached by Next Image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imageUrl} alt="本題原始題目與完整 AI 詳解" referrerPolicy="no-referrer" style={{ width: "100%", height: "auto", borderRadius: 10 }} />
        </details>
        {!sent && canSend && <>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, lineHeight: 1.7 }}><input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: 7, width: 20, height: 20, flexShrink: 0 }} />我確認是從「盧澔化學 @199dbmdh」一對一聊天室開啟，並同意傳送上方內容。</label>
          <small>內容會傳到開啟此頁的聊天室；系統無法辨識對方是否為盧澔化學。</small>
          <button className="hh-button-primary" type="button" disabled={!confirmed || busy} onClick={() => void send()}>{busy ? "正在傳送…" : "確認傳送文字與圖片"}</button>
        </>}
        {!sent && !canSend && chat && <a className="hh-button-primary" href={chat} rel="noreferrer">開啟盧澔化學聊天室，送出連結後再點開</a>}
        {sent && <button className="hh-button-primary" type="button" onClick={() => window.liff?.closeWindow()}>回 LINE 聊天室</button>}
        <small>交接連結有效至 {new Date(data.expiresAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}（台灣時間）。請勿轉傳給其他人。</small>
      </>}
      <Link href="/" className="hh-button-secondary">回解題實驗室</Link>
    </div>
  </main>;
}
