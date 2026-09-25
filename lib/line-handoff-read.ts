import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyHandoffToken } from "@/lib/line-handoff-token";
import { lineJson as json } from "@/lib/line-identity";

export async function readHandoff(token: string) {
  const claim = verifyHandoffToken(token);
  if (!claim) return json({ error: "交接連結已過期或無效，請回解題頁重新建立。" }, 410);
  const bucket = supabaseAdmin.storage.from("line-handoffs");
  const prefix = `${claim.studentId}/${claim.historyId}`;
  const [record, account, history] = await Promise.all([
    bucket.download(`${prefix}/request.json`),
    supabaseAdmin.from("students").select("active,must_change_pin").eq("id", claim.studentId).maybeSingle(),
    supabaseAdmin.from("solve_history").select("id").eq("id", claim.historyId).eq("student_id", claim.studentId).maybeSingle(),
  ]);
  if (record.error || !record.data || !account.data?.active || account.data.must_change_pin || !history.data) return json({ error: "這份交接已失效，請重新建立。" }, 410);
  const data = JSON.parse(await record.data.text());
  if (data.nonce !== claim.nonce || data.exp !== claim.exp) return json({ error: "已建立較新的交接，請重新開啟求助頁。" }, 410);
  const ttl = Math.max(1, Math.min(3600, claim.exp - Math.floor(Date.now() / 1000)));
  const [image, preview] = await Promise.all([bucket.createSignedUrl(`${prefix}/${claim.nonce}-image.jpg`, ttl), bucket.createSignedUrl(`${prefix}/${claim.nonce}-preview.jpg`, ttl)]);
  if (image.error || preview.error || !image.data || !preview.data) return json({ error: "無法讀取圖片，請稍後重試。" }, 503);
  return json({ text: data.text, imageUrl: image.data.signedUrl, previewUrl: preview.data.signedUrl, expiresAt: new Date(claim.exp * 1000).toISOString(), requestId: claim.nonce });
}
