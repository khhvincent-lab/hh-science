import {NextRequest,NextResponse} from 'next/server';
import {requireAdminSession,getAccessibleStudentIds} from '@/lib/admin-access';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {validImageId} from '@/lib/teaching-images';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const actor=await requireAdminSession(request);if(!actor)return NextResponse.json({error:'請先登入。'},{status:401});
 const {id}=await params;if(!validImageId(id))return NextResponse.json({error:'圖片識別碼錯誤。'},{status:400});
 try{
  const ids=await getAccessibleStudentIds(request,actor);if(ids!==null&&!ids.length)return NextResponse.json({items:[],count:0});
  let q=supabaseAdmin.from('solve_history').select('id,subject,created_at,students(name)',{count:'exact'}).contains('diagram',{libraryImages:[{id}]}).order('created_at',{ascending:false}).limit(20);
  let f=supabaseAdmin.from('solve_followups').select('id,solve_history_id,created_at,solve_history!inner(student_id,subject,students(name))',{count:'exact'}).contains('diagram',{libraryImages:[{id}]}).order('created_at',{ascending:false}).limit(20);
  if(ids!==null){q=q.in('student_id',ids);f=f.in('solve_history.student_id',ids);}
  const [history,followups]=await Promise.all([q,f]);if(history.error)throw history.error;if(followups.error)throw followups.error;
  const items=[...(history.data||[]).map(r=>{const s:any=Array.isArray(r.students)?r.students[0]:r.students;return {id:r.id,historyId:r.id,name:s?.name||'學生',createdAt:r.created_at,kind:'解題'};}),...(followups.data||[]).map(r=>{const h:any=Array.isArray(r.solve_history)?r.solve_history[0]:r.solve_history;const s=Array.isArray(h?.students)?h.students[0]:h?.students;return {id:r.id,historyId:r.solve_history_id,name:s?.name||'學生',createdAt:r.created_at,kind:'追問'};})].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20);
  return NextResponse.json({items,count:(history.count||0)+(followups.count||0)},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Image references',error);return NextResponse.json({error:'讀取引用紀錄失敗。'},{status:503});}
}
