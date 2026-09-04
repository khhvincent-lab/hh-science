import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyAdminSessionToken } from "@/lib/admin-session";

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get("hh_science_admin_session")?.value;
  return token ? verifyAdminSessionToken(token) : null;
}
const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({error:"未登入管理員。"},{status:401});
  const [{data:regions,error:re},{data:institutions,error:ie},{data:classes,error:ce},{data:students,error:se}] = await Promise.all([
    supabaseAdmin.from("regions").select("id,name,active,sort_order").order("sort_order").order("name"),
    supabaseAdmin.from("institutions").select("id,region_id,name,active,sort_order").order("sort_order").order("name"),
    supabaseAdmin.from("classes").select("id,institution_id,name,active,sort_order").order("sort_order").order("name"),
    supabaseAdmin.from("students").select("id,region_id,institution_id,class_id"),
  ]);
  const error=re||ie||ce||se; if(error) return NextResponse.json({error:`讀取組織資料失敗：${error.message}`},{status:500});
  return NextResponse.json({regions:regions??[],institutions:institutions??[],classes:classes??[],students:students??[]});
}

export async function POST(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body=await request.json().catch(()=>null); if(!body) return NextResponse.json({error:"資料格式錯誤。"},{status:400});
  const type=clean(body.type), name=clean(body.name); if(!name||name.length>50) return NextResponse.json({error:"名稱不可空白且最多 50 字。"},{status:400});
  if(type==="region") {
    const {data,error}=await supabaseAdmin.from("regions").insert({name}).select().single();
    return error?NextResponse.json({error:error.code==="23505"?"這個地區已存在。":error.message},{status:error.code==="23505"?409:500}):NextResponse.json({item:data});
  }
  if(type==="institution") {
    const regionId=clean(body.regionId); if(!regionId) return NextResponse.json({error:"缺少地區。"},{status:400});
    const {data,error}=await supabaseAdmin.from("institutions").insert({region_id:regionId,name}).select().single();
    return error?NextResponse.json({error:error.code==="23505"?"此地區已有同名合作單位。":error.message},{status:error.code==="23505"?409:500}):NextResponse.json({item:data});
  }
  if(type==="class") {
    const institutionId=clean(body.institutionId); if(!institutionId) return NextResponse.json({error:"缺少合作單位。"},{status:400});
    const {data,error}=await supabaseAdmin.from("classes").insert({institution_id:institutionId,name}).select().single();
    return error?NextResponse.json({error:error.code==="23505"?"此合作單位已有同名班級。":error.message},{status:error.code==="23505"?409:500}):NextResponse.json({item:data});
  }
  return NextResponse.json({error:"未知的新增類型。"},{status:400});
}

export async function DELETE(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body=await request.json().catch(()=>null); const type=clean(body?.type), id=clean(body?.id); if(!id) return NextResponse.json({error:"缺少 ID。"},{status:400});
  if(type==="class") {
    const {count}=await supabaseAdmin.from("students").select("id",{count:"exact",head:true}).eq("class_id",id);
    if((count??0)>0) return NextResponse.json({error:`此班級仍有 ${count} 位學生，請先移動學生。`},{status:409});
    const {error}=await supabaseAdmin.from("classes").delete().eq("id",id); return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true});
  }
  if(type==="institution") {
    const [{count:cc},{count:sc}]=await Promise.all([supabaseAdmin.from("classes").select("id",{count:"exact",head:true}).eq("institution_id",id),supabaseAdmin.from("students").select("id",{count:"exact",head:true}).eq("institution_id",id)]);
    if((cc??0)>0||(sc??0)>0) return NextResponse.json({error:`此合作單位仍有 ${cc??0} 個班級、${sc??0} 位學生，無法刪除。`},{status:409});
    const {error}=await supabaseAdmin.from("institutions").delete().eq("id",id); return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true});
  }
  if(type==="region") {
    const [{count:ic},{count:sc}]=await Promise.all([supabaseAdmin.from("institutions").select("id",{count:"exact",head:true}).eq("region_id",id),supabaseAdmin.from("students").select("id",{count:"exact",head:true}).eq("region_id",id)]);
    if((ic??0)>0||(sc??0)>0) return NextResponse.json({error:`此地區仍有 ${ic??0} 個合作單位、${sc??0} 位學生，無法刪除。`},{status:409});
    const {error}=await supabaseAdmin.from("regions").delete().eq("id",id); return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true});
  }
  return NextResponse.json({error:"未知的刪除類型。"},{status:400});
}
