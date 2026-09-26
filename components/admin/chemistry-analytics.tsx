'use client';
import {useEffect,useState} from 'react';
import type {ReadingReport} from '@/lib/chemistry-analytics';
import './chemistry-analytics.css';
const rate = (value:number|null) => value===null ? '—' : `${value}%`;
export default function ChemistryAnalytics() {
 const [range,setRange]=useState('30');
 const [refresh,setRefresh]=useState(0);
 const [report,setReport]=useState<ReadingReport|null>(null);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(true);
 useEffect(()=>{
  const controller=new AbortController();
  setLoading(true);setError('');setReport(null);
  void fetch(`/api/admin/chemistry-analytics?range=${range}`,{signal:controller.signal,cache:'no-store'})
   .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'讀取失敗');return data as ReadingReport;})
   .then(setReport).catch(error=>{if(!controller.signal.aborted)setError(error instanceof Error?error.message:'讀取失敗');})
   .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[range,refresh]);
 return <section className="reading-analytics hh-card admin-panel" aria-labelledby="reading-analytics-title">
  <header className="reading-analytics-head"><div><div className="hh-eyebrow">CHEMISTRY · READING INSIGHTS</div><h2 id="reading-analytics-title">專欄成效</h2><p>從點開文章，到完成三題，看看閱讀帶來多少練習。</p></div>
   <div className="reading-analytics-controls"><label>統計期間<select className="hh-select" value={range} onChange={e=>setRange(e.target.value)}><option value="7">最近 7 天</option><option value="30">最近 30 天</option><option value="all">上線至今</option></select></label><button type="button" className="hh-button-secondary" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>重新整理</button></div>
  </header>
  {loading&&<p role="status">正在整理閱讀與作答紀錄…</p>}
  {error&&<p role="alert">{error} <button type="button" onClick={()=>setRefresh(v=>v+1)}>重試</button></p>}
  {report&&<>
   <div className="reading-analytics-metrics">
    <article><span>{report.includesGuests?'文章瀏覽次數':'學生瀏覽次數'}</span><strong>{report.totals.views.toLocaleString()}<small>次</small></strong><p>重複開啟文章會再次計次</p></article>
    <article><span>瀏覽學生</span><strong>{report.totals.readers.toLocaleString()}<small>人</small></strong><p>期間內登入學生，不重複計人</p></article>
    <article><span>完成三題</span><strong>{report.totals.completers.toLocaleString()}<small>人</small></strong><p>至少一篇交卷，不要求全答對</p></article>
    <article className="reading-analytics-conversion"><span>閱讀 → 作答完成率</span><strong>{rate(report.totals.conversion)}</strong><p>完成三題人數 ÷ 瀏覽學生人數</p></article>
   </div>
   {report.totals.readers>0?<div className="reading-analytics-progress"><div><strong>{report.totals.readers} 人閱讀，其中 {report.totals.completers} 人完成練習</strong><span>{report.totals.readers-report.totals.completers} 人尚未交卷</span></div><progress max={report.totals.readers} value={report.totals.completers} aria-label="學生作答完成比例"/></div>:<div className="reading-analytics-empty"><strong>等待第一筆學生閱讀紀錄</strong><p>功能上線後才開始累積。學生登入後開啟文章，這裡就會出現數據。</p></div>}
   <div className="reading-analytics-table-head"><h3>每篇文章的參與情形</h3><span>人數於每篇文章內去重</span></div>
   <div className="reading-analytics-table-wrap"><table><thead><tr><th scope="col">文章</th><th scope="col">瀏覽次數</th><th scope="col">瀏覽學生</th><th scope="col">完成三題</th><th scope="col">完成率</th></tr></thead><tbody>{report.articles.map(article=><tr key={article.slug}><th scope="row"><a href={`/chemistry/${article.slug}`} target="_blank" rel="noreferrer">{article.title} ↗</a></th><td>{article.views}</td><td>{article.readers} 人</td><td>{article.completers} 人</td><td><strong>{rate(article.conversion)}</strong></td></tr>)}</tbody></table></div>
   <footer className="reading-analytics-notes">
    {report.includesGuests&&<p>未登入瀏覽：<strong>{report.totals.guestViews} 次</strong>，已包含在瀏覽次數中；無法辨認實際人數，因此不列入學生完成率。</p>}
    <p>僅顯示目前管理範圍內的學生。期間依文章開啟時間計算，完成狀態統計至更新時間；點開不代表已讀完。各篇人數相加可能大於總人數。</p>
    <p>不回推上線前資料。最近 7／30 天為連續 7／30 × 24 小時。更新：{new Date(report.endAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})}（台灣時間）</p>
   </footer>
  </>}
 </section>;
}
