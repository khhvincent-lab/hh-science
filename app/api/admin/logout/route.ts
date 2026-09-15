import { NextResponse } from "next/server";
import { ADMIN_SCOPE_COOKIE, ADMIN_SESSION_COOKIE } from "@/lib/admin-session";
export async function POST(){ const r=NextResponse.json({success:true}); r.cookies.delete(ADMIN_SESSION_COOKIE); r.cookies.delete(ADMIN_SCOPE_COOKIE); return r; }
