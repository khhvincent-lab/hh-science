"use client";
import { useRef, useState } from "react";
import { prepareHandoffImages } from "@/lib/line-handoff-image";
import { getOfficialLineChatUrl } from "@/lib/official-line";

type Props = { file: File | null; historyId?: string | null; question: string };
export default function TeacherHandoffPrepare({ file, historyId, question }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [prepared, setPrepared] = useState<{ file: File; historyId: string; question: string } | null>(null);
  const running = useRef(false);
  const chatUrl = getOfficialLineChatUrl("");
  const current = prepared?.file === file && prepared?.historyId === historyId && prepared?.question === question;
  async function prepare() {
    if (!file || !historyId || !chatUrl || running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      // Prepare on every deliberate request: a previous package may have expired
      // or already been sent from LINE.
      const { image, preview } = await prepareHandoffImages(file);
      const form = new FormData();
      form.set("historyId", historyId); form.set("question", question);
      form.set("image", image, "solution.jpg"); form.set("preview", preview, "preview.jpg");
      const response = await fetch("/api/line/handoff", { method: "POST", body: form, signal: AbortSignal.timeout(45000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "準備失敗，請稍後重試。");
      setPrepared({ file, historyId, question });
      // Same-window navigation avoids asynchronously opening a blocked popup.
      // Keep an explicit link for devices that require another user tap.
      window.location.assign(chatUrl);
    } catch (err) { setError(err instanceof Error && err.name !== "TimeoutError" ? err.message : "連線逾時，請重試。"); }
    finally { running.current = false; setBusy(false); }
  }
  return <div style={{ display: "grid", gap: 8, gridColumn: "1 / -1" }}>
    <button type="button" className="student-line-button v207-line-official-button" disabled={busy || !file || !historyId || !chatUrl} onClick={() => void prepare()}>{busy ? "正在整理題目，準備開啟 LINE…" : "詢問真人老師｜盧澔化學"}</button>
    <small>自動附上題目、詳解及學生資料。進入 LINE 後，點下方「傳送剛才的題目」。</small>
    {!file && <small role="status">正在產生詳解圖片，完成後即可詢問。</small>}
    {!historyId && <small role="status">這題尚未存入紀錄，請先使用圖片分享。</small>}
    {current && chatUrl && <p role="status" style={{ margin: 0 }}>題目已準備好（保留 24 小時）。若 LINE 沒有開啟，<a href={chatUrl}>點這裡前往聊天室</a>。</p>}
    {error && <p role="alert" style={{ margin: 0 }}>{error}</p>}
  </div>;
}
