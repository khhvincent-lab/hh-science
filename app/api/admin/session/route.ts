import { NextRequest, NextResponse } from "next/server";
import { ADMIN_SCOPE_COOKIE } from "@/lib/admin-session";
import { requireAdminSession } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const session = await requireAdminSession(request);
  if (!session) return NextResponse.json({ authenticated:false }, { status:401 });
  let scopeTeacher: any = null;
  const scopeId = request.cookies.get(ADMIN_SCOPE_COOKIE)?.value;
  if (scopeId && session.role !== "teacher") {
    const { data } = await supabaseAdmin.from("admin_users").select("id,display_name,username").eq("id",scopeId).maybeSingle();
    scopeTeacher = data ?? null;
  }
  return NextResponse.json({ authenticated:true, user:{ id:session.userId, username:session.username, displayName:session.displayName, role:session.role }, scopeTeacher });
}
