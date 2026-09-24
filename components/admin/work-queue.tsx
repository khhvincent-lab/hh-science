"use client";
import {useEffect,useState} from 'react';
export default function WorkQueue(){
 const [items,setItems]=useState<Array<{id:string;title:string;detail:string;href:string}>>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/admin/work-queue',{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error);setItems(d.items||[]);}catch(e){setError(e instanceof Error?e.message:'讀取失敗')}finally{setLoading(false)}}
 useEffect(()=>{void load()},[]);
 return <section className="hh-card admin-panel"><div className="admin-panel-header"><div><span className="hh-eyebrow">NEXT ACTIONS</span><h2>待處理工作</h2><p className="hh-muted">集中查看答案核對、教師校正及教材圖；題目各列最近 6 筆。</p></div><button className="hh-button-secondary" onClick={()=>void load()} disabled={loading}>重新整理</button></div>{loading?<p>正在整理…</p>:error?<p role="alert">{error}</p>:items.length?<ul className="upgrade-work-items">{items.map(i=><li key={i.id}><a href={i.href}><strong>{i.title} →</strong><small>{i.detail}</small></a></li>)}</ul>:<p className="hh-muted">目前沒有待處理工作。</p>}</section>;
}
