import {NextRequest, NextResponse} from 'next/server';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {verifySessionToken} from '@/lib/session';
import {chemistryArticles} from '@/lib/chemistry-articles';

export async function POST(request: NextRequest) {
 const origin = request.headers.get('origin');
 if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({error:'不允許的來源。'}, {status:403});
 try {
  const raw = await request.text();
  if (raw.length > 2048) return NextResponse.json({error:'資料過大。'}, {status:413});
  let body;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({error:'資料格式錯誤。'}, {status:400}); }
  const article = chemistryArticles.find(a => a.slug === body?.slug);
  if (!article || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body?.visitId || '') || !['view','complete'].includes(body?.event)) {
   return NextResponse.json({error:'無效的閱讀紀錄。'}, {status:400});
  }
  if (body.event === 'complete' && (!Array.isArray(body.answers) || body.answers.length !== article.questions.length || body.answers.some((answer:unknown, i:number) => !Number.isInteger(answer) || Number(answer) < 0 || Number(answer) >= article.questions[i].options.length))) {
   return NextResponse.json({error:'請完成每一題。'}, {status:400});
  }
  const token = request.cookies.get('hh_science_session')?.value;
  const session = token ? verifySessionToken(token) : null;
  let studentId: string | null = null;
  if (session) {
   const {data,error} = await supabaseAdmin.from('students').select('id,active').eq('id',session.studentId).maybeSingle();
   if (error) throw error;
   if (data?.active) studentId = data.id;
  }
  // The same visit ID makes retries idempotent. Identity is always derived on the server.
  const {error:insertError} = await supabaseAdmin.from('chemistry_reading_visits').upsert({
   id:body.visitId, slug:article.slug, student_id:studentId,
  }, {onConflict:'id',ignoreDuplicates:true});
  if (insertError) throw insertError;
  if (body.event === 'complete') {
   const score = article.questions.filter((q,i) => body.answers[i] === q.answer).length;
   let query = supabaseAdmin.from('chemistry_reading_visits').update({completed_at:new Date().toISOString(),score})
    .eq('id',body.visitId).eq('slug',article.slug).is('completed_at',null);
   query = studentId ? query.eq('student_id',studentId) : query.is('student_id',null);
   const {error} = await query;
   if (error) throw error;
  }
  return NextResponse.json({ok:true}, {headers:{'Cache-Control':'no-store'}});
 } catch (error) {
  console.error('Chemistry tracking failed',error);
  return NextResponse.json({error:'統計暫時無法同步。'}, {status:503});
 }
}
