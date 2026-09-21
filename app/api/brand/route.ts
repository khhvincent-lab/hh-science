import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { data, error } = await supabaseAdmin.from("brand_settings").select("*").eq("id", "default").maybeSingle();
  if (error) return NextResponse.json({ brand: { name: "解題實驗室", englishName: "H.H. Science Lab", adminName: "教師管理中心" } });
  const institutionId=request.nextUrl.searchParams.get("institutionId");
  let institutionTitle: string | null = null;
  if(institutionId && /^[0-9a-f-]{36}$/i.test(institutionId)) {
    const {data:institution}=await supabaseAdmin.from("institutions")
      .select("brand_title").eq("id",institutionId).eq("active",true).maybeSingle();
    institutionTitle=institution?.brand_title || null;
  }
  return NextResponse.json({ brand: data ? {
    name: institutionTitle || data.name,
    englishName: data.english_name,
    adminName: data.admin_name,
    primaryColor: data.primary_color,
    logoUrl: data.logo_url,
  } : { name: institutionTitle || "解題實驗室", englishName: "H.H. Science Lab", adminName: "教師管理中心" } });
}
