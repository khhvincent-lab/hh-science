import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const { data, error } = await supabaseAdmin.from("brand_settings").select("*").eq("id", "default").maybeSingle();
  if (error) return NextResponse.json({ brand: { name: "解題實驗室", englishName: "H.H. Science Lab", adminName: "教師管理中心" } });
  return NextResponse.json({ brand: data ? {
    name: data.name,
    englishName: data.english_name,
    adminName: data.admin_name,
    primaryColor: data.primary_color,
    logoUrl: data.logo_url,
  } : { name: "解題實驗室", englishName: "H.H. Science Lab", adminName: "教師管理中心" } });
}
