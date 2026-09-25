"use client";
import { useEffect, useRef, useState } from "react";

type Options = {
  regions: { id: string; name: string }[];
  institutions: { id: string; name: string; region_id: string }[];
  classes: { id: string; name: string; institution_id: string }[];
};
export default function LineStudentBinding({ onBound }: { onBound: () => Promise<void> }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [region, setRegion] = useState("");
  const [institution, setInstitution] = useState("");
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/login-options", { signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "班級讀取失敗。");
      if (!controller.signal.aborted) setOptions(value);
    }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "班級讀取失敗，請重新開啟。"); });
    return () => controller.abort();
  }, []);
  async function bind(event: React.FormEvent) {
    event.preventDefault();
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      const idToken = window.liff?.getIDToken();
      if (!idToken) throw new Error("LINE 授權失效，請關閉並重新開啟。");
      const login = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, name: name.trim(), pin }), signal: AbortSignal.timeout(20000) });
      const account = await login.json();
      setPin("");
      if (!login.ok) throw new Error(account.error || "登入失敗。");
      if (account.student?.mustChangePin) throw new Error("請先回網站完成個人 PIN 設定，再來綁定。");
      const response = await fetch("/api/line/binding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken, confirm: true }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "綁定失敗。");
      await onBound();
    } catch (error) { setError(error instanceof Error ? error.message : "綁定失敗，請稍後再試。"); }
    finally { working.current = false; setBusy(false); }
  }
  return <form onSubmit={event => void bind(event)} style={{ display: "grid", gap: 12 }}>
    <h2 style={{ fontSize: 20, margin: 0 }}>首次使用：綁定學生帳號</h2>
    <p style={{ margin: 0 }}>使用你在解題實驗室的姓名與個人 PIN。綁定後，這個 LINE 就能找回你在網站準備的題目。</p>
    <label>地區<select aria-label="地區" className="hh-input" required disabled={busy || !options} value={region} onChange={e => { setRegion(e.target.value); setInstitution(""); setClassId(""); }}><option value="">請選擇地區</option>{options?.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
    <label>補習班<select aria-label="補習班" className="hh-input" required disabled={busy || !region} value={institution} onChange={e => { setInstitution(e.target.value); setClassId(""); }}><option value="">請選擇補習班</option>{options?.institutions.filter(i => i.region_id === region).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
    <label>班級<select aria-label="班級" className="hh-input" required disabled={busy || !institution} value={classId} onChange={e => setClassId(e.target.value)}><option value="">請選擇班級</option>{options?.classes.filter(c => c.institution_id === institution).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>學生姓名<input className="hh-input" required autoComplete="username" maxLength={80} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>
    <label>個人 PIN<input className="hh-input" required type="password" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} autoComplete="current-password" value={pin} disabled={busy} onChange={e => setPin(e.target.value)} /></label>
    <button className="hh-button-primary" type="submit" disabled={busy || !options}>{busy ? "正在驗證…" : "驗證並綁定我的 LINE"}</button>
    <small>請只綁定自己的學生帳號及 LINE；更新 PIN 後會要求重新驗證。</small>
    {error && <p role="alert" style={{ margin: 0 }}>{error}</p>}
  </form>;
}
