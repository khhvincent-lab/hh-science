import {parseAIJson} from '@/lib/ai/json';
export const FORMAT_REVISION=2;
export const OUTPUT_CONTRACT='\n輸出格式：只回傳一個 JSON 物件。answer、explanation、options 必須為字串，answer 與 explanation 不得空白。沒有選項時 options 為空字串。無法辨識題目時請在 answer 與 explanation 說明原因。LaTeX 反斜線必須符合 JSON 跳脫規則；不要輸出 Markdown 圍欄。';
export function parseComparisonOutput(text:string){
 let value;try{value=parseAIJson(text);}catch{return {ok:false as const,code:'invalid_json'};}
 if(!value||typeof value!=='object'||Array.isArray(value))return {ok:false as const,code:'invalid_object'};
 // Numeric answers (including zero) are valid, but never fabricate missing fields.
 const answer=typeof value.answer==='number'&&Number.isFinite(value.answer)?String(value.answer):value.answer;
 if(typeof answer!=='string'||!answer.trim())return {ok:false as const,code:'missing_answer'};
 if(typeof value.explanation!=='string'||!value.explanation.trim())return {ok:false as const,code:'missing_explanation'};
 return {ok:true as const,result:{answer:answer.trim(),explanation:value.explanation.trim(),options:typeof value.options==='string'?value.options:'',diagram:value.diagram||null,chemicalStructure:value.chemicalStructure||null}};
}
