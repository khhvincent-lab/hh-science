import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    const [{ data: regions, error: regionError }, { data: institutions, error: institutionError }, { data: classes, error: classError }] =
      await Promise.all([
        supabaseAdmin
          .from("regions")
          .select("id,name,active")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabaseAdmin
          .from("institutions")
          .select("id,region_id,name,active")
          .eq("active", true)
          .order("name", { ascending: true }),
        supabaseAdmin
          .from("classes")
          .select("id,institution_id,name,active,academic_year")
          .eq("active", true)
          .order("academic_year", { ascending: false })
          .order("name", { ascending: true }),
      ]);

    if (regionError || institutionError || classError) {
      console.error("Student login options error:", {
        regionError,
        institutionError,
        classError,
      });
      return NextResponse.json({ error: "讀取班級資料失敗，請稍後再試。" }, { status: 500 });
    }

    return NextResponse.json({
      regions: regions ?? [],
      institutions: institutions ?? [],
      classes: classes ?? [],
    });
  } catch (error) {
    console.error("Student login options unexpected error:", error);
    return NextResponse.json({ error: "讀取班級資料失敗，請稍後再試。" }, { status: 500 });
  }
}
