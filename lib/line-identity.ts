import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const lineJson = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
export class LineAccessError extends Error {
  constructor(message: string, public status = 400, public code = "ERROR") { super(message); }
}
export function lineFailure(error: unknown) {
  return error instanceof LineAccessError ? lineJson({ error: error.message, code: error.code }, error.status) : lineJson({ error: "目前無法連線，請稍後重試。" }, 503);
}
export function checkLineOrigin(request: NextRequest) {
  let valid = false;
  try { const origin = new URL(request.headers.get("origin") || ""); valid = /^https?:$/.test(origin.protocol) && origin.host === (request.headers.get("host") || request.nextUrl.host); } catch { /* deny */ }
  if (!valid) throw new LineAccessError("請從解題實驗室操作。", 403);
}
export async function verifiedLineUser(idToken: unknown): Promise<string> {
  if (typeof idToken !== "string" || !idToken || idToken.length > 8000) throw new LineAccessError("請從 LINE 聊天室重新開啟並完成授權。", 401);
  // Never trust a client-supplied userId or decoded JWT. LINE verifies signature,
  // expiry and audience for this exact Login channel. No channel secret needed.
  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST", body: new URLSearchParams({ id_token: idToken, client_id: "2011732473" }),
    cache: "no-store", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new LineAccessError("LINE 授權已失效，請關閉後重新開啟。", 401);
  const claims = await response.json();
  if (claims.aud !== "2011732473" || claims.iss !== "https://access.line.me" || !/^U[0-9a-f]{32}$/.test(claims.sub || "") || !Number.isFinite(claims.exp) || claims.exp <= Date.now() / 1000) throw new LineAccessError("LINE 身分驗證失敗。", 401);
  return claims.sub;
}
export async function limitLineRequest(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const key = createHash("sha256").update(`line-handoff:${ip}`).digest("hex");
  const result = await supabaseAdmin.rpc("consume_auth_rate_limit", { p_rate_key: key, p_limit: 120, p_window_seconds: 60 });
  if (result.error) throw new LineAccessError("驗證服務暫時無法使用。", 503);
  const data = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!data?.allowed) throw new LineAccessError("操作較頻繁，請稍後再試。", 429);
}
export async function boundStudent(lineUserId: string) {
  const binding = await supabaseAdmin.from("student_line_bindings").select("student_id,pin_changed_at").eq("line_user_id", lineUserId).maybeSingle();
  if (binding.error) throw new LineAccessError("無法讀取綁定資料。", 503);
  if (!binding.data) throw new LineAccessError("首次使用，請先綁定你的學生帳號。", 409, "BIND_REQUIRED");
  const student = await supabaseAdmin.from("students").select("id,name,active,must_change_pin,pin_changed_at").eq("id", binding.data.student_id).maybeSingle();
  if (student.error) throw new LineAccessError("無法讀取學生資料。", 503);
  if (!student.data?.active || student.data.must_change_pin) throw new LineAccessError("帳號已停用或需要更新 PIN，請回網站確認。", 403);
  if (student.data.pin_changed_at !== binding.data.pin_changed_at) throw new LineAccessError("PIN 已更新，請重新驗證學生帳號。", 409, "BIND_REQUIRED");
  return student.data;
}
