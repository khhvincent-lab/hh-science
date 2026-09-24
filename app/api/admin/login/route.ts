import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MAX_AGE, createAdminSessionToken, normalizeAdminRole } from "@/lib/admin-session";

const ADMIN_RATE_LIMIT = { attempts: 5, windowSeconds: 15 * 60 };
function getClientIp(request: NextRequest) { const f=request.headers.get("x-forwarded-for"); return f?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"; }
function hashRateKey(parts: string[]) { return createHash("sha256").update(parts.join("|")).digest("hex"); }
async function consumeRateLimit(rateKey: string) {
  const { data, error } = await supabaseAdmin.rpc("consume_auth_rate_limit", { p_rate_key: rateKey, p_limit: ADMIN_RATE_LIMIT.attempts, p_window_seconds: ADMIN_RATE_LIMIT.windowSeconds });
  if (error) { console.error("Admin rate limit RPC error:", error); return { ok:false as const, serviceError:true as const, retryAfter:0 }; }
  const result=Array.isArray(data)?data[0]:data;
  if(!result?.allowed) return { ok:false as const, serviceError:false as const, retryAfter:Number(result?.retry_after_seconds??60) };
  return { ok:true as const, serviceError:false as const, retryAfter:0 };
}
async function clearRateLimit(rateKey:string){ await supabaseAdmin.from("auth_rate_limits").delete().eq("rate_key",rateKey); }

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { username?: string; password?: string } | null;
  const username = (body?.username || "admin").trim().toLowerCase();
  const password = body?.password || "";
  if (!username || !password) return NextResponse.json({ error: "請輸入帳號與密碼。" }, { status: 400 });
  const rateKey = hashRateKey(["admin-login", getClientIp(request), username]);
  const rate = await consumeRateLimit(rateKey);
  if (!rate.ok) return NextResponse.json({ error: rate.serviceError ? "管理員登入服務暫時無法使用。" : `登入嘗試次數過多，請約 ${Math.max(1,Math.ceil(rate.retryAfter/60))} 分鐘後再試。` }, { status: rate.serviceError ? 503 : 429 });

  let user: any = null;
  const lookup = await supabaseAdmin.from("admin_users").select("id,username,display_name,password_hash,role,active").eq("username", username).maybeSingle();
  if (!lookup.error && lookup.data) user = lookup.data;
  if (lookup.error && lookup.error.code !== "42P01") console.error("admin_users lookup:", lookup.error);

  let valid = false;
  let legacy = false;
  if (user) valid = Boolean(user.active) && await bcrypt.compare(password, user.password_hash);
  else if (username === "admin" && process.env.ADMIN_PASSWORD && password === process.env.ADMIN_PASSWORD) {
    valid = true; legacy = true;
    // migration 已執行時，自動把既有 ADMIN_PASSWORD 建成正式 super_admin。
    if (!lookup.error || lookup.error?.code !== "42P01") {
      const passwordHash = await bcrypt.hash(password, 12);
      const created = await supabaseAdmin.from("admin_users").insert({ username:"admin", display_name:"總管理員", password_hash:passwordHash, role:"super_admin", active:true }).select("id,username,display_name,role,active").maybeSingle();
      if (created.data) { user = created.data; legacy = false; }
    }
  }
  if (!valid) return NextResponse.json({ error: "帳號或密碼錯誤。" }, { status: 401 });
  await clearRateLimit(rateKey);
  if (user?.id) await supabaseAdmin.from("admin_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
  const token = createAdminSessionToken({ role:normalizeAdminRole(user?.role) ?? "super_admin", userId:user?.id ?? "legacy-admin", username:user?.username ?? "admin", displayName:user?.display_name ?? "總管理員", legacy });
  const response = NextResponse.json({ success:true, user:{ id:user?.id ?? "legacy-admin", username:user?.username ?? "admin", displayName:user?.display_name ?? "總管理員", role:normalizeAdminRole(user?.role) ?? "super_admin" } });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV === "production", path:"/", maxAge:ADMIN_SESSION_MAX_AGE });
  return response;
}
