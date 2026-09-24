"use client";
import { useRef, useState } from "react";
import { prepareHandoffImages } from "@/lib/line-handoff-image";
import { getOfficialLineChatUrl } from "@/lib/official-line";

type Props = { file: File | null; historyId?: string | null; question: string };
export default function TeacherHandoffPrepare({ file, historyId, question }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<{ file: File; historyId: string; question: string; url: string } | null>(null);
  const running = useRef(false);
  const current = prepared?.file === file && prepared?.historyId === historyId && prepared?.question === question ? prepared : null;
  async function prepare() {
    if (!file || !historyId || running.current) return;
    running.current = true;
    setBusy(true); setError(""); setPrepared(null);
    try {
      const { image, preview } = await prepareHandoffImages(file);
      const form = new FormData();
      form.set("historyId", historyId); form.set("question", question);
      form.set("image", image, "solution.jpg"); form.set("preview", preview, "preview.jpg");
      const response = await fetch("/api/line/handoff", { method: "POST", body: form, signal: AbortSignal.timeout(45000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "準備失敗，請稍後重試。");
      setPrepared({ file, historyId, question, url: data.url });
    } catch (err) { setError(err instanceof Error && err.name !== "TimeoutError" ? err.message : "連線逾時，請重新準備交接。"); }
    finally { running.current = false; setBusy(false); }
  }
  const message = current ? `老師您好，我想詢問這題。\n${current.url}\n學生請先送出這段訊息，再點上方連結，確認傳送題目與詳解圖片。` : "";
  const chatUrl = getOfficialLineChatUrl(message);
  return <div style={{ display: "grid", gap: 10 }}>
    <p style={{ margin: 0 }}>把題目、AI 詳解與你的疑問整理成一份交接，在 LINE 預覽後確認傳送。</p>
    {!current && <button type="button" className="hh-button-primary" disabled={busy || !file || !historyId} onClick={() => void prepare()}>{busy ? "正在整理完整題目與圖片…" : "準備真人導師交接"}</button>}
    {!file && <p role="status">正在準備詳解圖片，請稍候。</p>}
    {!historyId && <p role="status">這題尚未存入解題紀錄，請先使用下方圖片分享。</p>}
    {current && chatUrl && <>
      <a className="hh-button-primary" href={chatUrl} target="_blank" rel="noopener noreferrer">開啟盧澔化學 LINE</a>
      <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.8 }}><li>在聊天室按送出，傳送已填好的交接連結。</li><li>點剛送出的連結，預覽圖片後按「確認傳送」。</li></ol>
      <button type="button" className="hh-button-secondary" onClick={() => { void navigator.clipboard.writeText(message).then(() => setError("已複製，請貼到盧澔化學聊天室並送出。")).catch(() => setError("無法複製，請使用「開啟盧澔化學 LINE」。")); }}>複製交接訊息</button>
    </>}
    <small>連結有效 24 小時，持有連結者可查看本題及學生姓名，請只傳給老師。重新準備會使舊交接連結失效。</small>
    {error && <p role="status" style={{ margin: 0 }}>{error}</p>}
  </div>;
}
