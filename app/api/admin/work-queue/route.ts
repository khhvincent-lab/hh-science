import {NextRequest,NextResponse} from 'next/server';
import {requireAdminSession,getAccessibleStudentIds,isSuperAdmin} from '@/lib/admin-access';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {answerReviewState,getAccuracyReviews} from '@/lib/accuracy-review';
export async function GET(request:NextRequest){
 const actor=await requireAdminSession(request);if(!actor)return NextResponse.json({error:'請先登入。'},{status:401});
 try{
 const ids=await getAccessibleStudentIds(request,actor);if(ids!==null&&!ids.length)return NextResponse.json({items:[]});
 const items:Array<{id:string;title:string;detail:string;href:string;kind:string}>=[];
 let corrections=supabaseAdmin.from('teacher_correction_queue').select('id,solve_history_id,issue_type,students(name),created_at').eq('status','pending').order('created_at',{ascending:false}).limit(6);if(ids!==null)corrections=corrections.in('student_id',ids);
 const {data:rows,error}=await corrections;if(error)throw error;
 for(const row of rows||[]){const student:any=Array.isArray(row.students)?row.students[0]:row.students;items.push({id:row.id,title:`${student?.name||'學生'} · 教師校正`,detail:'檢查解法並補充教學說明',href:`/admin?section=teachingQuestions&calibration=${row.solve_history_id}`,kind:'correction'});}
 let found=0;
 for(let offset=0;found<6;offset+=200){let q=supabaseAdmin.from('solve_history').select('id,answer,reference_answer,options,subject,students(name),created_at').not('reference_answer','is',null).order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+199);if(ids!==null)q=q.in('student_id',ids);const {data,error}=await q;if(error)throw error;const reviews=await getAccuracyReviews((data||[]).map(r=>r.id));for(const row of data||[]){if(!answerReviewState(row.answer,row.reference_answer,reviews.get(row.id),row.options).needsReview)continue;const student:any=Array.isArray(row.students)?row.students[0]:row.students;items.push({id:row.id,title:`${student?.name||'學生'} · 答案待核對`,detail:'參考答案不一致；尚未算成 AI 答錯',href:`/admin?section=siteQuestions&question=${row.id}&sq_range=all&sq_focus=pending`,kind:'answer'});if(++found>=6)break;}if((data||[]).length<200)break;}
 if(isSuperAdmin(actor)){const {count,error}=await supabaseAdmin.from('teaching_images').select('id',{count:'exact',head:true}).eq('enabled',false).is('deleted_at',null);if(error)throw error;if(count)items.push({id:'images',title:`${count} 張教材圖尚未啟用`,detail:'確認說明與標籤後，再開放 AI 選用',href:'/admin?section=teachingImages',kind:'library'});}
 return NextResponse.json({items},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('Work queue',error);return NextResponse.json({error:'待處理工作讀取失敗。'},{status:503});}
}
