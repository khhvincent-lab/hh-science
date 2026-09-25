export const RUBRIC_VERSION = '1';
export const CRITERIA = ['answer','reasoning','image','clarity'] as const;
export type Criterion = typeof CRITERIA[number];
export type Rating = '1'|'0.5'|'0'|'unknown'|'na';
export type Ratings = Record<Criterion,Rating>;
export const CRITERIA_LABELS:Record<Criterion,string>={answer:'最終答案 · 45%',reasoning:'推導觀念 · 35%',image:'圖片辨識 · 10%',clarity:'教學表達 · 10%'};
export const OPTIONS:Record<Criterion,readonly (readonly [Rating,string])[]>={
 answer:[['1','正確'],['0.5','部分正確'],['0','錯誤'],['unknown','無法判定']],
 reasoning:[['1','正確'],['0.5','小瑕疵'],['0','重大錯誤'],['unknown','無法判定']],
 image:[['1','正常'],['0','漏讀或誤讀'],['na','不適用（無圖）'],['unknown','無法判定']],
 clarity:[['1','清楚'],['0.5','普通'],['0','不易理解'],['unknown','無法判定']],
};
export function validateRatings(value:unknown,hasImages:boolean):Ratings{
 if(!value||typeof value!=='object')throw Error('請完成所有評分。');
 const out={} as Ratings;
 for(const k of CRITERIA){const v=(value as Record<string,unknown>)[k];if(!OPTIONS[k].some(([key])=>key===v)||(k==='image'&&hasImages&&v==='na'))throw Error('評分選項不正確。');out[k]=v as Rating;}
 return out;
}
export function calculateScore(r:Ratings){
 if(CRITERIA.some(k=>r[k]==='unknown'))return {score:null,grade:'無法判定',reason:'不納入綜合平均',version:RUBRIC_VERSION};
 const weights={answer:45,reasoning:35,image:10,clarity:10};let sum=0,total=0;
 for(const k of CRITERIA){if(r[k]!=='na'){sum+=weights[k]*Number(r[k]);total+=weights[k];}}
 const score=sum/total*100;let grade=score>=90?'A 優良':score>=80?'B 良好':score>=60?'C 待改善':'D 不合格',reason='';
 if(r.answer==='0'||r.reasoning==='0'){grade='D 不合格';reason='答案錯誤或重大觀念錯誤';}
 else if(r.answer==='0.5'||r.image==='0'){if(score>=60)grade='C 待改善';reason='部分正確或辨識錯誤，最高 C';}
 return {score,grade,reason,version:RUBRIC_VERSION};
}
