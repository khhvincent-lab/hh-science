import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyHandoffToken } from "@/lib/line-handoff-token";
import { readHandoff } from "@/lib/line-handoff-read";
import { checkLineOrigin, limitLineRequest, verifiedLineUser, boundStudent, LineAccessError, lineJson, lineFailure } from "@/lib/line-identity";

export const runtime = "nodejs";
async function access(request: NextRequest) {
  checkLineOrigin(request);
  if (Number(request.headers.get("content-length") || 0) > 10000) throw new LineAccessError("資料過大。", 413);
  await limitLineRequest(request);
  const body = await request.json();
  const student = await boundStudent(await verifiedLineUser(body.idToken));
  const pending = await supabaseAdmin.from("student_line_pending").select("token,expires_at").eq("student_id", student.id).maybeSingle();
  if (pending.error) throw new LineAccessError("無法讀取待傳題目。", 503);
  if (!pending.data || Date.parse(pending.data.expires_at) <= Date.now()) throw new LineAccessError("目前沒有待傳題目。請回網站按「詢問真人老師」準備；題目保留 24 小時。", 404, "NO_PENDING");
  const claim = verifyHandoffToken(pending.data.token);
  if (!claim || claim.studentId !== student.id) throw new LineAccessError("這份題目已失效，請回網站重新準備。", 410);
  if (body.requestId && body.requestId !== claim.nonce) throw new LineAccessError("已有另一份待傳題目，請重新載入並確認內容，避免傳錯題。", 409, "CHANGED");
  return { body, student, pending: pending.data };
}
export async function POST(request: NextRequest) {
  try { const { pending } = await access(request); return await readHandoff(pending.token); }
  catch (error) { return lineFailure(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    const { body, student, pending } = await access(request);
    if (!body.requestId) throw new LineAccessError("缺少題目確認。", 400);
    // Compare-and-delete: never clear a newer question prepared during sending.
    const result = await supabaseAdmin.from("student_line_pending").delete().eq("student_id", student.id).eq("token", pending.token);
    if (result.error) throw new LineAccessError("無法更新傳送紀錄。", 503);
    return lineJson({ ok: true });
  } catch (error) { return lineFailure(error); }
}
