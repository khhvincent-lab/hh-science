import {notFound} from 'next/navigation';
import Link from 'next/link';
import {chemistryArticles} from '@/lib/chemistry-articles';
import ChemistryPractice from '@/components/chemistry-practice';

export function generateStaticParams(){return chemistryArticles.map(a=>({slug:a.slug}));}
export async function generateMetadata({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const article=chemistryArticles.find(a=>a.slug===slug);
 return {title:article?.title??'找不到文章'};
}
export default async function Page({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const a=chemistryArticles.find(a=>a.slug===slug);
 if(!a)notFound();
 return <article className="chem-article">
  <header className="chem-article-hero">
   <span className="chem-kicker">{a.category} · 素養閱讀</span>
   <h1>{a.title}</h1>
   <p className="chem-lead">{a.intro}</p>
   <ul className="chem-curriculum-tags" aria-label="高中化學知識連結">
    {a.curriculumTags.map(tag=><li key={tag}>{tag}</li>)}
   </ul>
   <dl className="chem-publication-meta">
    <div><dt>來源發布</dt><dd><time dateTime={a.sourceDate}>{a.sourceDate.replaceAll('-','/')}</time></dd></div>
    <div><dt>專欄上架</dt><dd><time dateTime={a.publishedAt}>{a.publishedAt.replaceAll('-','/')}</time></dd></div>
    <div><dt>閱讀時間</dt><dd>約 {a.minutes} 分鐘</dd></div>
   </dl>
  </header>
  <nav className="chem-jumps" aria-label="文章段落">
   <a href="#reading">01 閱讀</a><a href="#data">02 圖表</a><a href="#concepts">03 觀念</a><a href="#practice">04 練習</a>
  </nav>
  <section id="reading" className="chem-body-card" aria-label="閱讀文章">
   <h2><span>01</span> 新知閱讀</h2>{a.paragraphs.map((p,i)=><p key={i}>{p}</p>)}
  </section>
  <section id="data" className="chem-data-card">
   <h2><span>02</span> 圖表讀一讀</h2>
   <div className="chem-table"><table>
    <caption>{a.table.note}</caption>
    <thead><tr>{a.table.headers.map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead>
    <tbody>{a.table.rows.map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c}</td>)}</tr>)}</tbody>
   </table></div>
  </section>
  <section id="concepts" className="chem-concepts">
   <h2><span>03</span> 關鍵觀念複習</h2><ol>{a.concepts.map(c=><li key={c}>{c}</li>)}</ol>
  </section>
  <ChemistryPractice key={a.slug} slug={a.slug} questions={a.questions}/>
  <section className="chem-source">
   <h2>資料來源與閱讀界線</h2>
   <p>本文為教學改寫與原創練習。研究摘要依據下列來源；觀念、示意數據與練習為教學補充。延伸機制不需背誦，作答以文內資訊為依據。</p>
   <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer">{a.sourceName} · {a.sourceDate} 原文 ↗</a>
   <p className="chem-muted">資料核對：{a.publishedAt}。研究結果限於文中條件，並非學測命題預測。</p>
  </section>
  <Link className="chem-back" href="/chemistry">← 回到所有文章</Link>
 </article>;
}
