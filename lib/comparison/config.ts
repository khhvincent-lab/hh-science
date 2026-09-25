import {AI_MODELS,getAIModel,isAIModelId,type AIModelId,type ModelReasoningLevel} from '@/lib/ai-models';
export const SUBJECTS=['physics','chemistry','biology','earth','auto'] as const;
export type ComparisonConfig={enabled:boolean;percentage:number;dailyLimit:number;dailyBudgetTwd:number;usdTwd:number;subjects:string[];classIds:string[];referenceMode:'provided'|'hidden';a:{model:AIModelId;reasoning:ModelReasoningLevel};b:{model:AIModelId;reasoning:ModelReasoningLevel}};
export const DEFAULT_CONFIG:ComparisonConfig={enabled:false,percentage:20,dailyLimit:20,dailyBudgetTwd:50,usdTwd:32.5,subjects:[...SUBJECTS],classIds:[],referenceMode:'provided',a:{model:'gemini-3.8-flash',reasoning:'medium'},b:{model:'gpt-6-luna',reasoning:'medium'}};
export function validateConfig(raw:unknown):ComparisonConfig{
 if(!raw||typeof raw!=='object')throw Error('設定格式不正確。');const v=raw as ComparisonConfig;
 if(typeof v.enabled!=='boolean'||!Number.isInteger(v.percentage)||v.percentage<0||v.percentage>100||!Number.isInteger(v.dailyLimit)||v.dailyLimit<1||v.dailyLimit>1000||!Number.isFinite(v.dailyBudgetTwd)||v.dailyBudgetTwd<1||v.dailyBudgetTwd>100000||!Number.isFinite(v.usdTwd)||v.usdTwd<1||v.usdTwd>100)throw Error('請確認抽樣比例、每日上限及匯率。');
 if(!Array.isArray(v.subjects)||!v.subjects.length||v.subjects.some(s=>!SUBJECTS.includes(s as typeof SUBJECTS[number]))||!Array.isArray(v.classIds)||v.classIds.length>500||v.classIds.some(id=>!isUuid(id))||!['provided','hidden'].includes(v.referenceMode))throw Error('請確認科目、班級與參考答案設定。');
 for(const slot of [v.a,v.b]){if(!slot||!isAIModelId(slot.model)||slot.model==='gemini-2.5-flash'||!(getAIModel(slot.model).reasoningLevels as readonly string[]).includes(slot.reasoning))throw Error('請選擇可用模型與推理強度。');}
 if(v.a.model===v.b.model)throw Error('請選擇兩個不同模型。');
 return {enabled:v.enabled,percentage:v.percentage,dailyLimit:v.dailyLimit,dailyBudgetTwd:v.dailyBudgetTwd,usdTwd:v.usdTwd,subjects:[...new Set(v.subjects)],classIds:[...new Set(v.classIds)],referenceMode:v.referenceMode,a:{model:v.a.model,reasoning:v.a.reasoning},b:{model:v.b.model,reasoning:v.b.reasoning}};
}
export function isUuid(v:unknown):v is string{return typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);}
export const comparisonModels=()=>Object.values(AI_MODELS).filter(m=>m.id!=='gemini-2.5-flash');
// Conservative reservation, not a provider billing guarantee. Failed/unknown calls retain it.
export function reserveTwd(config:ComparisonConfig){return Math.ceil([config.a,config.b].reduce((s,slot)=>{const m=getAIModel(slot.model);return s+(65536*m.inputPrice+16384*m.outputPrice)/1e6;},0)*config.usdTwd*100)/100;}
