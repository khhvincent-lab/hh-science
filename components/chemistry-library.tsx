'use client';
import Link from 'next/link';
import {useState} from 'react';
type Summary={slug:string;title:string;intro:string;category:string;sourceDate:string;minutes:number};
export default function ChemistryLibrary({articles}:{articles:Summary[]}){
 const [query,setQuery]=useState(''); const [category,setCategory]=useState('全部');
 const shown=articles.filter(a=>(category==='全部'||a.category===category)&&`${a.title}${a.intro}${a.category}`.includes(query.trim()));
 return <section aria-label="文章列表"><div className="chem-filters"><label>搜尋文章<input type="search" placeholder="試試：塑膠、水泥、咖啡…" value={query} onChange={e=>setQuery(e.target.value)}/></label><label>主題<select value={category} onChange={e=>setCategory(e.target.value)}>{['全部',...new Set(articles.map(a=>a.category))].map(c=><option key={c}>{c}</option>)}</select></label></div><p className="chem-muted" aria-live="polite">共 {shown.length} 篇 · 依來源發布日期由新到舊排列</p><div className="chem-grid">{shown.map(a=><Link className="chem-card" key={a.slug} href={`/chemistry/${a.slug}`}><div className="chem-meta"><span>{a.category}</span><time>{a.sourceDate}</time></div>{a.slug===articles[0]?.slug&&<span className="chem-kicker">最新精選</span>}<h2>{a.title}</h2><p>{a.intro}</p><span className="chem-card-bottom">{a.minutes} 分鐘 · 3 題素養練習 <b aria-hidden>↗</b></span></Link>)}</div>{shown.length===0&&<p>找不到符合的文章，試試其他關鍵字或選擇「全部」。</p>}</section>;
}
