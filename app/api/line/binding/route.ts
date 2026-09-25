import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifySessionToken } from "@/lib/session";
import { checkLineOrigin, verifiedLineUser, limitLineRequest, LineAccessError, lineJson, lineFailure } from "@/lib/line-identity";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    checkLineOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 10000) throw new LineAccessError("資料過大。", 413);
    const session = verifySessionToken(request.cookies.get("hh_science_session")?.value || "");
    if (!session) throw new LineAccessError("請先登入學生帳號。", 401);
    await limitLineRequest(request);
    const body = await request.json();
    if (body.confirm !== true) throw new LineAccessError("請確認綁定學生帳號。", 400);
    const lineUserId = await verifiedLineUser(body.idToken);
    const student = await supabaseAdmin.from("students").select("id,active,must_change_pin,pin_changed_at").eq("id", session.studentId).maybeSingle();
    if (student.error) throw new LineAccessError("無法驗證學生帳號。", 503);
    if (!student.data?.active || student.data.must_change_pin) throw new LineAccessError("請先回網站完成個人 PIN 設定。", 403);
    // INSERT plus unique constraints prevents concurrent requests from replacing
    // another student's binding. Refresh only the exact existing pair.
    const existing = await supabaseAdmin.from("student_line_bindings").select("student_id").eq("line_user_id", lineUserId).maybeSingle();
    if (existing.error) throw new LineAccessError("無法讀取綁定。", 503);
    if (existing.data && existing.data.student_id !== session.studentId) throw new LineAccessError("這個 LINE 已綁定另一位學生，請先解除原綁定。", 409);
    const fields = { student_id: session.studentId, line_user_id: lineUserId, pin_changed_at: student.data.pin_changed_at };
    const result = existing.data
      ? await supabaseAdmin.from("student_line_bindings").update({ pin_changed_at: fields.pin_changed_at }).eq("student_id", session.studentId).eq("line_user_id", lineUserId)
      : await supabaseAdmin.from("student_line_bindings").insert(fields);
    if (result.error) throw new LineAccessError(result.error.code === "23505" ? "學生帳號已綁定 LINE。請使用原本 LINE，或請老師協助解除綁定。" : "綁定暫時失敗，請重試。", result.error.code === "23505" ? 409 : 503);
    return lineJson({ ok: true });
  } catch (error) { return lineFailure(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    checkLineOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 10000) throw new LineAccessError("資料過大。", 413);
    await limitLineRequest(request);
    const body = await request.json();
    const lineUserId = await verifiedLineUser(body.idToken);
    const result = await supabaseAdmin.from("student_line_bindings").delete().eq("line_user_id", lineUserId);
    if (result.error) throw new LineAccessError("解除綁定失敗，請稍後再試。", 503);
    return lineJson({ ok: true });
  } catch (error) { return lineFailure(error); }
}
