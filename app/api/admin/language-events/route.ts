import { NextRequest, NextResponse } from 'next/server';
import { getAccessibleStudentIds, requireAdminSession } from '@/lib/admin-access';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdminSession(request);
    if (!admin) return NextResponse.json({ error: '請重新登入管理中心。' }, { status: 401 });
    const accessible = await getAccessibleStudentIds(request, admin);
    if (accessible?.length === 0) return NextResponse.json({ events: [], total: 0 });
    const rawPage = Number(request.nextUrl.searchParams.get('page') || 1);
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.min(10000, Math.floor(rawPage))) : 1;
    const status = request.nextUrl.searchParams.get('status');
    const search = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
    let students: string[] | null = accessible;
    if (search) {
      let names = supabaseAdmin.from('students').select('id').ilike('name', `%${search.replace(/[%_\\]/g, '\\$&')}%`);
      if (accessible) names = names.in('id', accessible);
      const { data, error } = await names;
      if (error) throw error;
      students = (data || []).map(row => row.id);
      if (!students.length) return NextResponse.json({ events: [], total: 0 });
    }
    let query = supabaseAdmin.from('followup_language_events').select('id,student_id,solve_history_id,question,category,reason,source,status,needs_review,reviewed_at,review_note,created_at,students(name,campus,classes(name),institutions(name))', { count: 'exact' });
    if (students) query = query.in('student_id', students);
    if (status === 'pending') query = query.eq('needs_review', true).eq('status', 'active');
    if (status === 'active' || status === 'dismissed') query = query.eq('status', status);
    const { data, count, error } = await query.order('created_at', { ascending: false }).range((page - 1) * 20, page * 20 - 1);
    if (error) throw error;
    // Counts are across the student's full day, not only this page/filter.
    const ids = [...new Set((data || []).map(row => row.student_id))];
    const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
    const counts: Record<string, number> = {};
    if (ids.length) {
      await Promise.all(ids.map(async id => {
        const { count, error: countError } = await supabaseAdmin.from('followup_language_events').select('id', { count: 'exact', head: true }).eq('student_id', id).eq('status', 'active').gte('created_at', `${today}T00:00:00+08:00`);
        if (countError) throw countError;
        counts[id] = count || 0;
      }));
    }
    return NextResponse.json({ events: (data || []).map(row => ({ ...row, todayCount: counts[row.student_id] || 0 })), total: count || 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Language events read failed', error);
    return NextResponse.json({ error: '讀取用語提醒紀錄失敗，請稍後重試。' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdminSession(request);
    if (!admin) return NextResponse.json({ error: '請重新登入管理中心。' }, { status: 401 });
    const body = await request.json().catch(() => null);
    if (!body || !/^[0-9a-f-]{36}$/i.test(body.id || '') || !['dismiss', 'review'].includes(body.action)) return NextResponse.json({ error: '覆核資料格式不正確。' }, { status: 400 });
    const { data: event, error } = await supabaseAdmin.from('followup_language_events').select('student_id').eq('id', body.id).maybeSingle();
    if (error) throw error;
    if (!event) return NextResponse.json({ error: '找不到紀錄。' }, { status: 404 });
    const accessible = await getAccessibleStudentIds(request, admin);
    if (accessible !== null && !accessible.includes(event.student_id)) return NextResponse.json({ error: '沒有這位學生的管理權限。' }, { status: 403 });
    const { error: reviewError } = await supabaseAdmin.rpc('review_followup_language', { p_event_id: body.id, p_admin_id: admin.userId, p_dismiss: body.action === 'dismiss', p_note: String(body.note || '').slice(0, 500) });
    if (reviewError) throw reviewError;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Language event review failed', error);
    return NextResponse.json({ error: '儲存覆核失敗，請稍後重試。' }, { status: 500 });
  }
}
