import {NextRequest,NextResponse} from 'next/server';
import {requireAdminSession,getAccessibleStudentIds} from '@/lib/admin-access';
import {supabaseAdmin} from '@/lib/supabase-admin';
import {chemistryArticles} from '@/lib/chemistry-articles';
import {summarizeReading,type ReadingVisit} from '@/lib/chemistry-analytics';

export async function GET(request:NextRequest) {
 try {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({error:'請先登入教師後台。'}, {status:401});
  const range = request.nextUrl.searchParams.get('range') || '30';
  if (!['7','30','all'].includes(range)) return NextResponse.json({error:'無效的日期範圍。'}, {status:400});
  const endAt = new Date().toISOString();
  // Rolling days, rather than ambiguous browser-local calendar days.
  const startAt = range === 'all' ? null : new Date(Date.now() - Number(range)*86400000).toISOString();
  const studentIds = await getAccessibleStudentIds(request,admin);
  const chunks: (string[] | null)[] = studentIds === null ? [null] : [];
  if (studentIds) for (let i=0;i<studentIds.length;i+=120) chunks.push(studentIds.slice(i,i+120));
  const visits: ReadingVisit[] = [];
  for (const ids of chunks) {
   for (let offset=0;;offset+=1000) {
    let query = supabaseAdmin.from('chemistry_reading_visits')
     .select('id,slug,student_id,viewed_at,completed_at').lt('viewed_at',endAt)
     .order('viewed_at').order('id').range(offset,offset+999);
    if (startAt) query = query.gte('viewed_at',startAt);
    if (ids) query = query.in('student_id',ids);
    const {data,error} = await query;
    if (error) throw error;
    // Completions belong to visits opened within this period, and the same snapshot cutoff.
    visits.push(...(data || []).map(row=>({...row,completed_at:row.completed_at && row.completed_at<endAt ? row.completed_at : null})));
    if ((data?.length || 0)<1000) break;
   }
  }
  return NextResponse.json({range,startAt,endAt,includesGuests:studentIds===null,
   totals:summarizeReading(visits),
   articles:chemistryArticles.map(article=>({slug:article.slug,title:article.title,...summarizeReading(visits.filter(v=>v.slug===article.slug))})),
  }, {headers:{'Cache-Control':'private, no-store'}});
 } catch(error) {
  console.error('Chemistry analytics failed',error);
  return NextResponse.json({error:'讀取專欄成效失敗，請稍後重試。'}, {status:500});
 }
}
