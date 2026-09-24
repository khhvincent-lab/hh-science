import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession,isSuperAdmin } from '@/lib/admin-access';
import { getAIModel,isAIModelId } from '@/lib/ai-models';
import { runSolver } from '@/lib/ai/solver';
import { parseAIJson } from '@/lib/ai/json';
import { supabaseAdmin } from '@/lib/supabase-admin';
export const maxDuration=180;
export async function POST(request:NextRequest){
 const actor=await requireAdminSession(request);
 if(!actor)return NextResponse.json({error:'請先登入。'},{status:401});
 if(!isSuperAdmin(actor))return NextResponse.json({error:'僅總管理員可測試模型。'},{status:403});
 try{
  const body=await request.json(),id=String(body.model||'');
  if(!isAIModelId(id)||id==='gemini-2.5-flash')return NextResponse.json({error:'模型不支援。'},{status:400});
  const model=getAIModel(id),reasoning=model.reasoningLevels.includes(body.reasoning)?body.reasoning:'low';
  const guard=await supabaseAdmin.rpc('consume_auth_rate_limit',{p_rate_key:`model-test:${actor.userId}`,p_limit:6,p_window_seconds:60});
  if(guard.error)return NextResponse.json({error:'測試暫時無法啟動。'},{status:503});
  if(!(Array.isArray(guard.data)?guard.data[0]:guard.data)?.allowed)return NextResponse.json({error:'請稍候再測試。'},{status:429});
  const started=Date.now();
  const result=await runSolver({model:id,reasoning,prompt:'Identify the main color in the attached image and calculate 1+1. Return only JSON: {"color":"red or blue or green","answer":2}.',images:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAABLElEQVR4nO3RQREAIAzAMIZ/zyAjjzUKetd5J9LVAds1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgDcAagDUAawDWAKwBWAOwBmANwBqANQBrANYArAFYA7AGYA3AGoA1AGsA1gCsAVgDsAZgH8/hAf+bYtS1AAAAAElFTkSuQmCC'],expectJson:true});
  const parsed=parseAIJson(result.text),passed=parsed?.color==='red'&&Number(parsed?.answer)===2;
  const test={model:id,reasoning,passed,elapsedMs:Date.now()-started,estimatedCostUsd:result.usage.estimatedCostUsd,testedAt:new Date().toISOString()};
  await supabaseAdmin.from('app_settings').upsert({id:`model_test:${id}`,value:test});
  return NextResponse.json({...test,message:passed?'文字、圖片與 JSON 回傳測試通過；不代表所有題型皆正確。':'有收到模型回覆，但圖片或格式測試未通過。'});
 }catch(error){console.error('model test failed',error instanceof Error?error.message:'unknown');return NextResponse.json({error:'模型測試失敗，請確認此 API 帳號有權限、額度足夠，或稍後再試。'},{status:502});}
}
