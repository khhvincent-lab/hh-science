import { NextRequest,NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-access';
import { verifySessionToken } from '@/lib/session';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { TEACHING_IMAGE_BUCKET,validImageId } from '@/lib/teaching-images';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;if(!validImageId(id))return new NextResponse(null,{status:404});
 const admin=await requireAdminSession(request);
 const token=request.cookies.get('hh_science_session')?.value,student=token?verifySessionToken(token):null;
 if(!admin&&!student)return new NextResponse(null,{status:401});
 const {data:asset,error}=await supabaseAdmin.from('teaching_images').select('id,storage_path,mime_type,enabled,deleted_at,subject').eq('id',id).maybeSingle();if(error||!asset)return new NextResponse(null,{status:404});
 if(!admin){
  const {data:account}=await supabaseAdmin.from('students').select('active,must_change_pin').eq('id',student!.studentId).maybeSingle();if(!account?.active||account.must_change_pin)return new NextResponse(null,{status:403});
  // Students only receive images attached to their own saved solution or follow-up.
  const [history,followups]=await Promise.all([
   supabaseAdmin.from('solve_history').select('id').eq('student_id',student!.studentId).contains('diagram',{libraryImages:[{id}]}).limit(1),
   supabaseAdmin.from('solve_followups').select('id').eq('student_id',student!.studentId).contains('diagram',{libraryImages:[{id}]}).limit(1)
  ]);
  if(!history.data?.length&&!followups.data?.length)return new NextResponse(null,{status:403});
 }
 const {data:blob,error:downloadError}=await supabaseAdmin.storage.from(TEACHING_IMAGE_BUCKET).download(asset.storage_path);if(downloadError||!blob)return new NextResponse(null,{status:404});
 return new NextResponse(await blob.arrayBuffer(),{headers:{'Content-Type':asset.mime_type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
