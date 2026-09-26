import {chemistryArticles} from '@/lib/chemistry-articles';
import ChemistryLibrary from '@/components/chemistry-library';
export const metadata={title:'每週化學｜素養閱讀',description:'從生活讀懂化學：科學新知、關鍵觀念複習與學測素養練習。'};
export default function Page(){
 const summaries=chemistryArticles.map(({slug,title,intro,category,sourceDate,minutes})=>({slug,title,intro,category,sourceDate,minutes}));
 return <><header className="chem-hero"><span className="chem-kicker">生活 × 化學 × 素養</span><h1>每週化學</h1><p>每週一篇，從生活讀懂化學，練習用證據思考。</p><small>2026 年度精選 · 1–9 月起步選輯 · 閱讀與練習約 8 分鐘</small></header><ChemistryLibrary articles={summaries}/></>;
}
