import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAccessibleClassIds, isSuperAdmin, requireAdminSession } from "@/lib/admin-access";

const clean = (v: unknown) => typeof v === "string" ? v.trim() : "";
const ALL_SUBJECTS = ["physics","chemistry","biology","earth"];
function cleanSubjects(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(clean).filter((item) => ALL_SUBJECTS.includes(item)))];
}

export async function GET(request: NextRequest) {
  const session = await requireAdminSession(request); if (!session) return NextResponse.json({error:"未登入管理員。"},{status:401});
  const [{data:regions,error:re},{data:institutions,error:ie},{data:classes,error:ce},{data:students,error:se}] = await Promise.all([
    supabaseAdmin.from("regions").select("id,name,active,sort_order").order("sort_order").order("name"),
    supabaseAdmin.from("institutions").select("id,region_id,name,brand_title,active,sort_order").order("sort_order").order("name"),
    supabaseAdmin.from("classes").select("id,institution_id,name,active,sort_order,academic_year,allowed_subjects").order("academic_year",{ascending:false}).order("sort_order").order("name"),
    supabaseAdmin.from("students").select("id,region_id,institution_id,class_id"),
  ]);
  const error=re||ie||ce||se; if(error) return NextResponse.json({error:`讀取組織資料失敗：${error.message}`},{status:500});
  const forceAll = request.nextUrl.searchParams.get("all") === "1" && isSuperAdmin(session);
  const allowedClassIds = forceAll ? null : await getAccessibleClassIds(request, session);
  if (allowedClassIds === null) return NextResponse.json({regions:regions??[],institutions:institutions??[],classes:classes??[],students:students??[]});
  const scopedClasses=(classes??[]).filter((row:any)=>allowedClassIds.includes(String(row.id)));
  const institutionIds=new Set(scopedClasses.map((row:any)=>String(row.institution_id)));
  if(session.role==="teacher"){
    const {data:grants,error:grantError}=await supabaseAdmin.from("admin_user_institutions").select("institution_id").eq("admin_user_id",session.userId);
    if(grantError)return NextResponse.json({error:grantError.message},{status:500});
    for(const grant of grants??[])institutionIds.add(String(grant.institution_id));
  }
  const scopedInstitutions=(institutions??[]).filter((row:any)=>institutionIds.has(String(row.id)));
  const regionIds=new Set(scopedInstitutions.map((row:any)=>String(row.region_id)));
  const scopedRegions=(regions??[]).filter((row:any)=>regionIds.has(String(row.id)));
  const scopedStudents=(students??[]).filter((row:any)=>row.class_id&&allowedClassIds.includes(String(row.class_id)));
  return NextResponse.json({regions:scopedRegions,institutions:scopedInstitutions,classes:scopedClasses,students:scopedStudents});
}

export async function POST(request: NextRequest) {
  const session = await requireAdminSession(request); if (!session) return NextResponse.json({error:"未登入管理員。"},{status:401});
  if (session.role === "teacher") return NextResponse.json({error:"新增地區、補習班或班級僅限總管理員。"},{status:403});
  const body=await request.json().catch(()=>null); if(!body) return NextResponse.json({error:"資料格式錯誤。"},{status:400});
  const type=clean(body.type), name=clean(body.name); if(!name||name.length>50) return NextResponse.json({error:"名稱不可空白且最多 50 字。"},{status:400});
  if(type==="region") {
    if (!isSuperAdmin(session)) return NextResponse.json({error:"僅總管理員可以新增地區。"},{status:403});
    const {data,error}=await supabaseAdmin.from("regions").insert({name}).select().single();
    return error?NextResponse.json({error:error.code==="23505"?"這個地區已存在。":error.message},{status:error.code==="23505"?409:500}):NextResponse.json({item:data});
  }
  if(type==="institution") {
    if (!isSuperAdmin(session)) return NextResponse.json({error:"僅總管理員可以新增補習班。"},{status:403});
    const regionId=clean(body.regionId); if(!regionId) return NextResponse.json({error:"缺少地區。"},{status:400});
    const {data,error}=await supabaseAdmin.from("institutions").insert({region_id:regionId,name}).select().single();
    return error?NextResponse.json({error:error.code==="23505"?"此地區已有同名合作單位。":error.message},{status:error.code==="23505"?409:500}):NextResponse.json({item:data});
  }
  if(type==="class") {
    const institutionId=clean(body.institutionId); if(!institutionId) return NextResponse.json({error:"缺少合作單位。"},{status:400});
    const allowed=await getAccessibleClassIds(request,session);
    if(allowed!==null){const {data:grants}=await supabaseAdmin.from("admin_user_institutions").select("institution_id").eq("admin_user_id",session.userId);if(!(grants??[]).some((g:any)=>g.institution_id===institutionId))return NextResponse.json({error:"沒有此補習班的新增權限。"},{status:403});}
    const academicYearRaw=Number(body.academicYear);
    const academicYear=Number.isInteger(academicYearRaw)&&academicYearRaw>=2020&&academicYearRaw<=2100?academicYearRaw:new Date().getFullYear();
    const allowedSubjects=cleanSubjects(body.allowedSubjects);
    const {data,error}=await supabaseAdmin.from("classes").insert({institution_id:institutionId,name,academic_year:academicYear,allowed_subjects:allowedSubjects.length?allowedSubjects:["chemistry"]}).select().single();
    return error?NextResponse.json({error:error.code==="23505"?"此合作單位已有同名班級。":error.message},{status:error.code==="23505"?409:500}):NextResponse.json({item:data});
  }
  return NextResponse.json({error:"未知的新增類型。"},{status:400});
}

export async function PATCH(request: NextRequest) {
  const session = await requireAdminSession(request); if (!session) return NextResponse.json({error:"未登入管理員。"},{status:401});
  const body=await request.json().catch(()=>null); if(!body) return NextResponse.json({error:"資料格式錯誤。"},{status:400});
  const action=clean(body.action);
  if(action==="update_institution_title") {
    if(!isSuperAdmin(session))return NextResponse.json({error:"只有總管理員可以變更補習班品牌。"},{status:403});
    const institutionId=clean(body.institutionId);
    const brandTitle=clean(body.brandTitle);
    if(!institutionId) return NextResponse.json({error:"缺少補習班 ID。"},{status:400});
    if(brandTitle.length>80) return NextResponse.json({error:"顯示標題不可超過 80 字。"},{status:400});
    const {data,error}=await supabaseAdmin.from("institutions")
      .update({brand_title:brandTitle || null}).eq("id",institutionId)
      .select("id,name,brand_title").single();
    return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true,item:data});
  }
  if(action==="update_class_subjects") {
    const classId=clean(body.classId);
    const allowedSubjects=cleanSubjects(body.allowedSubjects);
    if(!classId) return NextResponse.json({error:"缺少班級。"},{status:400});
    const scoped=await getAccessibleClassIds(request,session);if(scoped!==null&&!scoped.includes(classId))return NextResponse.json({error:"沒有此班級的管理權限。"},{status:403});
    if(!allowedSubjects.length) return NextResponse.json({error:"至少要開放 1 個科目。"},{status:400});
    const {data:before}=await supabaseAdmin.from("classes").select("allowed_subjects").eq("id",classId).maybeSingle();
    const {data,error}=await supabaseAdmin.from("classes").update({allowed_subjects:allowedSubjects}).eq("id",classId).select("id,name,allowed_subjects").single();
    if(!error && data) {
      const {error:auditError}=await supabaseAdmin.from("admin_account_audit").insert({actor_id:session.userId,target_id:classId,action:"update_class_subjects",details:{previous:before?.allowed_subjects??null,next:allowedSubjects}});
      if(auditError)console.error("Class subject audit failure:",auditError);
    }
    return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true,item:data});
  }
  if(action!=="promote_class") return NextResponse.json({error:"未知操作。"},{status:400});
  if(!isSuperAdmin(session))return NextResponse.json({error:"整班升班僅限總管理員。"},{status:403});
  const sourceClassId=clean(body.sourceClassId), targetClassId=clean(body.targetClassId);
  if(!sourceClassId||!targetClassId||sourceClassId===targetClassId) return NextResponse.json({error:"請選擇不同的來源班級與目標班級。"},{status:400});
  const scoped=await getAccessibleClassIds(request,session);if(scoped!==null&&(!scoped.includes(sourceClassId)||!scoped.includes(targetClassId)))return NextResponse.json({error:"沒有來源或目標班級權限。"},{status:403});

  const [{data:sourceClass,error:sourceError},{data:targetClass,error:targetError}] = await Promise.all([
    supabaseAdmin.from("classes").select("id,name,institution_id,academic_year").eq("id",sourceClassId).maybeSingle(),
    supabaseAdmin.from("classes").select("id,name,institution_id,academic_year,institutions(region_id,regions(name))").eq("id",targetClassId).maybeSingle(),
  ]);
  if(sourceError||targetError||!sourceClass||!targetClass) return NextResponse.json({error:"找不到來源或目標班級。"},{status:404});

  const {data:students,error:studentsError}=await supabaseAdmin.from("students").select("id,class_id,institution_id,region_id,campus").eq("class_id",sourceClassId);
  if(studentsError) return NextResponse.json({error:studentsError.message},{status:500});
  const rows=students??[];
  if(!rows.length) return NextResponse.json({success:true,moved:0});

  const institution=(targetClass as any).institutions;
  const regionId=institution?.region_id ?? null;
  const regionName=institution?.regions?.name ?? null;
  const ids=rows.map((r:any)=>r.id);
  const {error:updateError}=await supabaseAdmin.from("students").update({
    class_id:targetClassId,
    institution_id:(targetClass as any).institution_id,
    region_id:regionId,
    ...(regionName?{campus:`${regionName}班`}:{}),
  }).in("id",ids);
  if(updateError) return NextResponse.json({error:`升班失敗：${updateError.message}`},{status:500});

  const history=rows.map((r:any)=>({
    student_id:r.id,
    from_class_id:sourceClassId,
    to_class_id:targetClassId,
    from_academic_year:(sourceClass as any).academic_year ?? null,
    to_academic_year:(targetClass as any).academic_year ?? null,
    reason:"annual_promotion",
  }));
  const {error:historyError}=await supabaseAdmin.from("student_class_history").insert(history);
  if(historyError) console.error("student_class_history insert failed",historyError);
  return NextResponse.json({success:true,moved:ids.length,sourceClass,targetClass});
}

export async function DELETE(request: NextRequest) {
  const session = await requireAdminSession(request); if (!session) return NextResponse.json({error:"未登入管理員。"},{status:401});
  if (session.role === "teacher") return NextResponse.json({error:"教師不可刪除組織或班級。"},{status:403});
  const body=await request.json().catch(()=>null); const type=clean(body?.type), id=clean(body?.id); if(!id) return NextResponse.json({error:"缺少 ID。"},{status:400});
  if(type==="class") {
    const scoped=await getAccessibleClassIds(request,session);if(scoped!==null&&!scoped.includes(id))return NextResponse.json({error:"沒有此班級權限。"},{status:403});
    const {count}=await supabaseAdmin.from("students").select("id",{count:"exact",head:true}).eq("class_id",id);
    if((count??0)>0) return NextResponse.json({error:`此班級仍有 ${count} 位學生，請先移動學生。`},{status:409});
    const {error}=await supabaseAdmin.from("classes").delete().eq("id",id); return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true});
  }
  if(type==="institution") {
    if(!isSuperAdmin(session))return NextResponse.json({error:"只有總管理員可刪除補習班。"},{status:403});
    const [{count:cc},{count:sc}]=await Promise.all([supabaseAdmin.from("classes").select("id",{count:"exact",head:true}).eq("institution_id",id),supabaseAdmin.from("students").select("id",{count:"exact",head:true}).eq("institution_id",id)]);
    if((cc??0)>0||(sc??0)>0) return NextResponse.json({error:`此合作單位仍有 ${cc??0} 個班級、${sc??0} 位學生，無法刪除。`},{status:409});
    const {error}=await supabaseAdmin.from("institutions").delete().eq("id",id); return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true});
  }
  if(type==="region") {
    if(!isSuperAdmin(session))return NextResponse.json({error:"只有總管理員可刪除地區。"},{status:403});
    const [{count:ic},{count:sc}]=await Promise.all([supabaseAdmin.from("institutions").select("id",{count:"exact",head:true}).eq("region_id",id),supabaseAdmin.from("students").select("id",{count:"exact",head:true}).eq("region_id",id)]);
    if((ic??0)>0||(sc??0)>0) return NextResponse.json({error:`此地區仍有 ${ic??0} 個合作單位、${sc??0} 位學生，無法刪除。`},{status:409});
    const {error}=await supabaseAdmin.from("regions").delete().eq("id",id); return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({success:true});
  }
  return NextResponse.json({error:"未知的刪除類型。"},{status:400});
}
