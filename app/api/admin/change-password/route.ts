import bcrypt from "bcryptjs";
import { NextRequest,NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function POST(request:NextRequest){
 const user=await requireAdminSession(request);
 if(!user||user.legacy)return NextResponse.json({error:"請先重新登入正式管理員帳號。"},{status:401});
 const body=await request.json().catch(()=>null);
 const current=String(body?.currentPassword??""); const next=String(body?.newPassword??"");
 if(next.length<10||next.length>128)return NextResponse.json({error:"新密碼長度需為 10–128 碼。"},{status:400});
 const {data,error}=await supabaseAdmin.from("admin_users").select("id,password_hash,active").eq("id",user.userId).maybeSingle();
 if(error||!data?.active||!(await bcrypt.compare(current,data.password_hash)))return NextResponse.json({error:"原密碼錯誤或帳號停用。"},{status:403});
 const hash=await bcrypt.hash(next,12);
 const {error:up}=await supabaseAdmin.from("admin_users").update({password_hash:hash,password_changed_at:new Date().toISOString()}).eq("id",user.userId);
 if(up)return NextResponse.json({error:up.message},{status:500});
 const response=NextResponse.json({success:true,message:"密碼已更新，請重新登入。"});
 response.cookies.delete("hh_science_admin_session");return response;
}
