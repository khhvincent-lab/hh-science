"use client";
import Script from "next/script";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TEACHER_LIFF_ID } from "@/lib/line-liff";
import { getOfficialLineChatUrl } from "@/lib/official-line";
import LineStudentBinding from "@/components/line-student-binding";
import { compactHandoffText } from "@/lib/line-handoff-text";

type Package = { text: string; imageUrl: string; previewUrl: string; expiresAt: string; requestId: string };
class ReadError extends Error {
  constructor(message: string, public code = "") { super(message); }
}
async function readPackage(token: string, requestId?: string): Promise<Package> {
  const response = await fetch(token ? "/api/line/handoff" : "/api/line/pending", {
    method: token ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(token ? { token } : { idToken: window.liff?.getIDToken(), requestId }),
    cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  if (!response.ok) throw new ReadError(data.error || "無法讀取題目。", data.code);
  return data;
}
export default function TeacherHandoff() {
  const [status, setStatus] = useState("正在連接 LINE…");
  const [data, setData] = useState<Package | null>(null);
  const [canSend, setCanSend] = useState(false);
  const [connectionReady, setConnectionReady] = useState(false);
  const [legacy, setLegacy] = useState(false);
  const [needsBinding, setNeedsBinding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [unlinkConfirm, setUnlinkConfirm] = useState(false);
  const token = useRef("");
  const initialized = useRef(false);
  const sending = useRef(false);
  const ready = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { if (!ready.current) setStatus("LINE 連線較慢，請確認網路，或關閉此頁後從聊天室選單重新開啟。"); }, 25000);
    return () => window.clearTimeout(timer);
  }, []);
  async function load() {
    setBusy(true); setNeedsBinding(false); setData(null); setSent(false);
    try {
      const info = await readPackage(token.current);
      setData(info);
      let alreadySent = false;
      try { alreadySent = sessionStorage.getItem("line-sent:" + info.requestId) === "yes"; } catch { /* storage may be disabled */ }
      setSent(alreadySent);
      setStatus(alreadySent ? "已送出，請回聊天室查看。" : "題目與詳解已備妥。");
    } catch (error) {
      if (error instanceof ReadError && error.code === "BIND_REQUIRED") setNeedsBinding(true);
      setStatus(error instanceof Error ? error.message : "讀取失敗，請重試。");
    } finally { setBusy(false); }
  }
  async function initialize() {
    if (initialized.current || !window.liff) return;
    initialized.current = true;
    try {
      const liff = window.liff;
      await liff.init({ liffId: TEACHER_LIFF_ID });
      token.current = new URL(window.location.href).searchParams.get("handoff") || "";
      setLegacy(Boolean(token.current));
      const grants = liff.isInClient() ? await liff.permission.getGrantedAll() : [];
      const allowed = liff.isInClient() && liff.getContext()?.type === "utou" && grants.includes("chat_message.write");
      setCanSend(allowed);
      ready.current = true;
      setConnectionReady(true);
      if (!allowed) { setStatus("請從盧澔化學的一對一聊天室，點下方「傳送剛才的題目」，並同意傳送訊息權限。"); return; }
      await load();
    } catch { ready.current = true; setStatus("LINE 連線失敗，請關閉此頁後從聊天室重新開啟。"); }
  }
  async function send() {
    const liff = window.liff;
    if (!liff || !data || !canSend || sent || sending.current) return;
    sending.current = true; setBusy(true);
    let attempted = false;
    try {
      if (!liff.isInClient() || liff.getContext()?.type !== "utou" || !(await liff.permission.getGrantedAll()).includes("chat_message.write")) throw new Error("請從盧澔化學聊天室重新開啟並同意傳送權限。");
      const fresh = await readPackage(token.current, data.requestId);
      if (fresh.requestId !== data.requestId) throw new Error("題目已變更，請重新載入並確認內容。");
      attempted = true;
      await liff.sendMessages([{ type: "text", text: compactHandoffText(fresh.text) }, { type: "image", originalContentUrl: fresh.imageUrl, previewImageUrl: fresh.previewUrl }]);
      setSent(true);
      try { sessionStorage.setItem("line-sent:" + fresh.requestId, "yes"); } catch { /* optional duplicate guard */ }
      setStatus("LINE 已接受傳送，請回聊天室查看。這不代表老師已讀。");
      if (!token.current) {
        try {
          await fetch("/api/line/pending", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: liff.getIDToken(), requestId: fresh.requestId }), signal: AbortSignal.timeout(8000) });
        } catch { /* message already accepted; do not offer resend */ }
      }
      liff.closeWindow();
    } catch (error) {
      if (!attempted && error instanceof ReadError && error.code === "CHANGED") setData(null);
      setStatus(attempted ? "尚未取得傳送成功確認。請先回聊天室檢查有沒有文字與圖片，避免重複傳送；確認沒有後再重試。" : (error instanceof Error ? error.message : "無法傳送，請稍後再試。"));
    } finally { sending.current = false; setBusy(false); }
  }
  async function unlink() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/line/binding", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: window.liff?.getIDToken() }), signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("解除綁定失敗，請稍後再試。");
      setUnlinkConfirm(false); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : "解除綁定失敗。"); }
    finally { setBusy(false); }
  }
  const chat = getOfficialLineChatUrl("");
  return <main style={{ maxWidth: 640, margin: "0 auto", padding: "24px 14px 40px", minHeight: "100dvh" }}>
    <Script src="https://static.line-scdn.net/liff/edge/2/sdk.js" strategy="afterInteractive" onReady={() => void initialize()} onError={() => { ready.current = true; setStatus("無法載入 LINE，請確認網路後重新開啟。"); }} />
    <div className="hh-card" style={{ padding: 20, display: "grid", gap: 16 }}>
      <header><h1 style={{ fontSize: 22, margin: 0 }}>詢問真人老師</h1></header>
      <p role="status" aria-live="polite" style={{ margin: 0 }}>{status}</p>
      {needsBinding && canSend && <LineStudentBinding onBound={load} />}
      {data && <>
        <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", font: "inherit", margin: 0, lineHeight: 1.6 }}>{compactHandoffText(data.text)}</pre>
        {!sent && canSend && <>
          <small>將傳至目前聊天室，請確認為盧澔化學（@199dbmdh）。</small>
          <button className="hh-button-primary" type="button" disabled={busy} onClick={() => void send()}>{busy ? "正在傳送…" : "確認傳送"}</button>
        </>}
        {sent && <button className="hh-button-primary" type="button" onClick={() => window.liff?.closeWindow()}>回 LINE 聊天室</button>}
        <details><summary style={{ cursor: "pointer" }}>預覽題目與詳解</summary>
          {/* Signed images must not be cached by the Next image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.imageUrl} alt="本題原始題目與完整 AI 詳解" referrerPolicy="no-referrer" style={{ width: "100%", height: "auto", borderRadius: 10, marginTop: 12 }} />
        </details>
      </>}
      {!canSend && connectionReady && chat && <a className="hh-button-primary" href={chat} rel="noreferrer">前往盧澔化學聊天室</a>}
      {canSend && !needsBinding && !sent && !data && <button className="hh-button-secondary" type="button" disabled={busy} onClick={() => void load()}>重新讀取待傳題目</button>}
      {canSend && !legacy && <details><summary>帳號綁定設定</summary>
        <p>若要改用另一個學生帳號，請先解除目前 LINE 綁定。這不會刪除解題紀錄。</p>
        {!unlinkConfirm ? <button type="button" className="hh-button-secondary" disabled={busy} onClick={() => setUnlinkConfirm(true)}>解除綁定…</button> : <div style={{ display: "grid", gap: 8 }}><button type="button" className="hh-button-secondary" disabled={busy} onClick={() => void unlink()}>確認解除此 LINE 綁定</button><button type="button" className="hh-button-secondary" onClick={() => setUnlinkConfirm(false)}>取消</button></div>}
      </details>}
      <Link href="/" className="hh-button-secondary">回解題實驗室</Link>
    </div>
  </main>;
}
