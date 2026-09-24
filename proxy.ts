import { NextRequest,NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-access";
/** Service-role API 邊界：未完成逐筆租戶授權的端點，對非總管理員預設拒絕。 */
export async function proxy(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path==="/api/admin/login")return NextResponse.next();
 const user=await requireAdminSession(request);
 if(!user)return NextResponse.json({error:"管理員登入已失效，請重新登入。"},{status:401});
 if(user.role==="super_admin")return NextResponse.next();
 const exact=new Set([
  "/api/admin/session","/api/admin/logout","/api/admin/change-password",
  "/api/admin/dashboard","/api/admin/class-overview","/api/admin/organizations",
  "/api/admin/teachers","/api/admin/students","/api/admin/students/bulk",
  "/api/admin/corrections",
 ]);
 const readOnly=new Set([
  "/api/admin/brand","/api/admin/settings","/api/admin/student-auth-settings",
  "/api/admin/ai-settings","/api/admin/analytics","/api/admin/latency-analytics",
  "/api/admin/dashboard-insights","/api/admin/dashboard-accuracy","/api/admin/cost-alert-settings",
  "/api/admin/teaching-settings","/api/admin/input-guard",
  "/api/admin/teaching-knowledge","/api/admin/teaching-questions",
  "/api/admin/quota-settings",
 ]);
 const allowed=exact.has(path)||/^\/api\/admin\/students\/[^/]+\/history$/.test(path)
  ||(request.method==="GET"&&readOnly.has(path));
 if(!allowed)return NextResponse.json({error:"此功能尚未完成跨補習班資料隔離，已限制非總管理員存取。"},{status:403});
 return NextResponse.next();
}
export const config={matcher:["/api/admin/:path*"]};
