import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { createHandoffToken, verifyHandoffToken, HANDOFF_TTL, UUID } from "@/lib/line-handoff-token";
import { TEACHER_LIFF_URL } from "@/lib/line-liff";

export const runtime = "nodejs";
export const maxDuration = 30;
const bucket = () => supabaseAdmin.storage.from("line-handoffs");
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
async function jpeg(file: FormDataEntryValue | null, max: number) {
  if (!(file instanceof File) || file.type !== "image/jpeg" || file.size < 4 || file.size > max) throw new Error("圖片格式或大小不符合限制，請重新準備圖片。");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw new Error("圖片格式不正確。");
  return bytes;
}

// Only an authenticated owner may create a share. Viewing requires a separate,
// expiring capability token, never a student session or a LINE Channel secret.
export async function POST(request: NextRequest) {
  // Next's internal URL can use localhost behind a reverse proxy. Compare the
  // browser Origin with the actual request Host, including its port.
  let sameOrigin = false;
  try {
    const origin = new URL(request.headers.get("origin") || "");
    sameOrigin = /^https?:$/.test(origin.protocol) && origin.host === (request.headers.get("host") || request.nextUrl.host);
  } catch { /* absent or malformed Origin */ }
  if (!sameOrigin) return json({ error: "請從解題實驗室操作。" }, 403);
  const session = verifySessionToken(request.cookies.get("hh_science_session")?.value || "");
  if (!session) return json({ error: "請重新登入後再試。" }, 401);
  if (Number(request.headers.get("content-length") || 0) > 4000000) return json({ error: "圖片太大，請重新準備。" }, 413);
  try {
    const form = await request.formData();
    const historyId = String(form.get("historyId") || "");
    const question = String(form.get("question") || "").trim();
    if (!UUID.test(historyId) || question.length > 1000) return json({ error: "題目或疑問格式不正確。" }, 400);
    const [studentResult, historyResult] = await Promise.all([
      supabaseAdmin.from("students").select("name,campus,active,must_change_pin").eq("id", session.studentId).maybeSingle(),
      supabaseAdmin.from("solve_history").select("id,answer,explanation,options").eq("id", historyId).eq("student_id", session.studentId).maybeSingle(),
    ]);
    if (studentResult.error || historyResult.error) throw new Error("目前無法讀取解題紀錄，請稍後再試。");
    const student = studentResult.data, history = historyResult.data;
    if (!student?.active || student.must_change_pin) return json({ error: "請重新登入並完成密碼設定。" }, 403);
    if (!history) return json({ error: "找不到可分享的題目。" }, 404);
    const [image, preview] = await Promise.all([jpeg(form.get("image"), 3000000), jpeg(form.get("preview"), 500000)]);
    const nonce = randomUUID();
    const exp = Math.floor(Date.now() / 1000) + HANDOFF_TTL;
    const prefix = `${session.studentId}/${historyId}`;
    // Immutable image paths prevent an earlier token from showing a different
    // snapshot while a replacement is being uploaded.
    const prior = await bucket().download(`${prefix}/request.json`);
    let priorNonce: string | null = null;
    if (prior.data) {
      try { const value = JSON.parse(await prior.data.text()); if (UUID.test(value.nonce)) priorNonce = value.nonce; } catch { /* no prior manifest */ }
    }
    const text = ["【解題實驗室｜真人導師求助】", `學生：${student.name}`, `班級／補習班：${student.campus}`, `題目編號：${historyId}`, `學生疑問：${question || "想請老師協助釐清這題的觀念與解法。"}`, `AI 答案：${String(history.answer || "").slice(0, 1200)}`, "完整題目、觀念詳解與選項解析請見附圖。"].join("\n");
    for (const [name, bytes] of [["image.jpg", image], ["preview.jpg", preview]] as const) {
      const result = await bucket().upload(`${prefix}/${nonce}-${name}`, bytes, { upsert: true, contentType: "image/jpeg", cacheControl: "0" });
      if (result.error) throw new Error("交接圖片儲存失敗，請稍後再試。");
    }
    const saved = await bucket().upload(`${prefix}/request.json`, JSON.stringify({ nonce, exp, text }), { upsert: true, contentType: "application/json", cacheControl: "0" });
    if (saved.error) throw new Error("交接資料儲存失敗，請稍後再試。");
    if (priorNonce) await bucket().remove([`${prefix}/${priorNonce}-image.jpg`, `${prefix}/${priorNonce}-preview.jpg`]);
    const token = createHandoffToken({ studentId: session.studentId, historyId, nonce, exp });
    return json({ url: `${TEACHER_LIFF_URL}?handoff=${encodeURIComponent(token)}`, expiresAt: new Date(exp * 1000).toISOString() });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "交接準備失敗，請再試一次。" }, 400);
  }
}

// Read the capability in a body so it is not placed in API request access logs.
export async function PUT(request: NextRequest) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 2048) return json({ error: "無效的交接連結。" }, 400);
    const body = await request.json();
    const claim = verifyHandoffToken(typeof body.token === "string" ? body.token : "");
    if (!claim) return json({ error: "交接連結已過期或無效，請回解題頁重新建立。" }, 410);
    const prefix = `${claim.studentId}/${claim.historyId}`;
    const [record, account, history] = await Promise.all([
      bucket().download(`${prefix}/request.json`),
      supabaseAdmin.from("students").select("active,must_change_pin").eq("id", claim.studentId).maybeSingle(),
      supabaseAdmin.from("solve_history").select("id").eq("id", claim.historyId).eq("student_id", claim.studentId).maybeSingle(),
    ]);
    if (record.error || !record.data || !account.data?.active || account.data.must_change_pin || !history.data) return json({ error: "這份交接已失效，請重新建立。" }, 410);
    const data = JSON.parse(await record.data.text());
    if (data.nonce !== claim.nonce || data.exp !== claim.exp) return json({ error: "已建立較新的交接連結，請使用最新連結。" }, 410);
    const ttl = Math.max(1, Math.min(3600, claim.exp - Math.floor(Date.now() / 1000)));
    const [image, preview] = await Promise.all([bucket().createSignedUrl(`${prefix}/${claim.nonce}-image.jpg`, ttl), bucket().createSignedUrl(`${prefix}/${claim.nonce}-preview.jpg`, ttl)]);
    if (image.error || preview.error || !image.data || !preview.data) return json({ error: "無法讀取圖片，請稍後重試。" }, 503);
    return json({ text: data.text, imageUrl: image.data.signedUrl, previewUrl: preview.data.signedUrl, expiresAt: new Date(claim.exp * 1000).toISOString() });
  } catch { return json({ error: "無法讀取交接資料，請回解題頁重新建立。" }, 400); }
}
