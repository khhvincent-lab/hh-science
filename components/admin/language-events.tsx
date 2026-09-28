'use client';
import { useCallback, useEffect, useState } from 'react';
import styles from './language-events.module.css';

type Event = {
 id: string; student_id: string; question: string; category: 'profanity' | 'insult' | 'threat'; reason: string;
 source: string; status: string; needs_review: boolean; created_at: string; todayCount: number;
 students: { name: string; campus: string; classes: { name: string } | null; institutions: { name: string } | null } | null;
};
export default function LanguageEvents() {
 const [events, setEvents] = useState<Event[]>([]);
 const [total, setTotal] = useState(0);
 const [page, setPage] = useState(1);
 const [filter, setFilter] = useState('all');
 const [search, setSearch] = useState('');
 const [query, setQuery] = useState('');
 const [loading, setLoading] = useState(false);
 const [busy, setBusy] = useState('');
 const [error, setError] = useState('');
 const [notice, setNotice] = useState('');
 const load = useCallback(async (signal?: AbortSignal) => {
   setLoading(true); setError('');
   try {
     const response = await fetch(`/api/admin/language-events?${new URLSearchParams({ page: String(page), status: filter, q: query })}`, { cache: 'no-store', signal });
     const data = await response.json(); if (!response.ok) throw Error(data.error);
     setEvents(data.events); setTotal(data.total);
   } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : '讀取失敗'); }
   finally { if (!signal?.aborted) setLoading(false); }
 }, [page, filter, query]);
 useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
 async function review(id: string, action: 'dismiss' | 'review') {
   setBusy(id); setError(''); setNotice('');
   try {
     const response = await fetch('/api/admin/language-events', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action }) });
     const data = await response.json(); if (!response.ok) throw Error(data.error);
     setNotice(action === 'dismiss' ? '已撤銷誤判、移除該次計數，並解除目前的追問暫停。' : '已標記為老師已查看。'); await load();
   } catch (e) { setError(e instanceof Error ? e.message : '操作失敗'); }
   finally { setBusy(''); }
 }
 return <section className={`hh-card ${styles.panel}`}>
   <div><div className="hh-eyebrow">RESPECTFUL LEARNING</div><h2>用語提醒紀錄</h2><p>先提醒修改，再處理重複違規。合理質疑解答不計違規；僅顯示你有權管理的學生。</p></div>
   <div className={styles.rules}>每日第 1 次提醒 · 第 2 次警告 · 第 3 次起暫停追問 5 分鐘<br/>威脅與人身辱罵列入待查看；被擋訊息不扣追問次數。每日以台灣時間重新計數。</div>
   <form className={styles.filters} onSubmit={e => { e.preventDefault(); setPage(1); setQuery(search.trim()); }}>
     <label>學生姓名<input className="hh-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋學生" maxLength={80}/></label>
     <label>紀錄狀態<select className="hh-select" value={filter} onChange={e => { setFilter(e.target.value); setPage(1); }}><option value="all">全部紀錄</option><option value="pending">教師待查看</option><option value="active">有效提醒</option><option value="dismissed">已撤銷誤判</option></select></label>
     <button className="hh-button-secondary" type="submit">搜尋</button><button className="hh-button-secondary" type="button" disabled={loading} onClick={() => void load()}>重新整理</button>
   </form>
   {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
   {loading ? <p role="status">讀取紀錄中…</p> : !events.length ? <p>目前沒有符合條件的用語提醒紀錄。</p> : <div className={styles.list}>{events.map(item => <article key={item.id} className={styles.event}>
     <div className={styles.heading}><strong>{item.students?.name || '學生'}</strong><span>{item.status === 'dismissed' ? '已撤銷' : item.needs_review ? '教師待查看' : '有效提醒'} · 今日 {item.todayCount} 次</span></div>
     <small>{[item.students?.campus, item.students?.institutions?.name, item.students?.classes?.name].filter(Boolean).join(' · ')} · {new Date(item.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}</small>
     <blockquote>{item.question}</blockquote>
     <p><strong>{{ profanity: '粗俗用語', insult: '人身辱罵', threat: '威脅言語' }[item.category]}</strong> · {item.reason}</p>
     {item.status !== 'dismissed' && <div className={styles.actions}>{item.needs_review && <button type="button" className="hh-button-secondary" disabled={Boolean(busy)} onClick={() => void review(item.id, 'review')}>標記已查看</button>}<button type="button" className="hh-button-secondary" disabled={Boolean(busy)} onClick={() => void review(item.id, 'dismiss')}>{busy === item.id ? '處理中…' : '撤銷誤判'}</button></div>}
   </article>)}</div>}
   <div className={styles.pagination}><button type="button" className="hh-button-secondary" disabled={page === 1 || loading} onClick={() => setPage(p => p - 1)}>上一頁</button><span>第 {page} / {Math.max(1, Math.ceil(total / 20))} 頁 · 共 {total} 筆</span><button type="button" className="hh-button-secondary" disabled={page * 20 >= total || loading} onClick={() => setPage(p => p + 1)}>下一頁</button></div>
 </section>;
}
