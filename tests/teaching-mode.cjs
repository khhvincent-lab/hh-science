const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,Buffer,URL,Date,console,require:id=>{
  if(id in mocks)return mocks[id];
  if(id.startsWith('@/'))return load(id.slice(2)+'.ts',mocks);
  if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id)+'.ts',mocks);
  return require(id);
 }},{filename:file});return exports;
}
const modes=load('lib/teaching-modes.ts');
for(const mode of ['concise','standard','deep'])assert.ok(modes.isStudentTeachingMode(mode));
for(const mode of ['correction','toString','',null,{},['deep']])assert.equal(modes.isStudentTeachingMode(mode),false);
assert.equal(modes.studentDefaultMode('correction'),'standard');
const contexts=['concise','standard','deep'].map(m=>modes.buildTeachingModeInstructions(m));
assert.equal(new Set(contexts).size,3);
const prompts=load('lib/ai/prompts.ts');
for(const context of contexts){
 for(const prompt of [prompts.buildPrimaryPrompt({subject:'chemistry',teachingContext:context}),prompts.buildArbiterPrompt({subject:'chemistry',primaryAnswer:'B',teachingContext:context})]){
  assert.ok(prompt.includes(context));assert.ok(prompt.includes('keyReview'));
  assert.ok(!prompt.includes('【觀念解析要精簡】'));assert.ok(!prompt.includes('原則上控制在 4～7 個重點步驟'));
 }
}
let defaultMode='concise',authenticated=true;
const db={from(table){const q={select(){return q},eq(){return q},order(){return q},limit(){return q},in(){return q},not(){return q},maybeSingle:async()=>({data:{value:{mode:defaultMode}},error:null}),then(resolve){resolve({data:[],error:null})}};return q;}};
const engine=load('lib/teaching-engine.ts',{'@/lib/supabase-admin':{supabaseAdmin:db}});
const jobs=load('lib/solve-jobs.ts',{'./supabase-admin':{supabaseAdmin:db},'./session':{},'./teaching-images':{imageMime:()=> 'image/png'},'next/server':{}});
const png='data:image/png;base64,iVBORw0KGgo=';
const input={images:[png],subject:'chemistry'};
assert.equal(jobs.validateSolveInput(input).teachingMode,undefined);
for(const mode of ['concise','standard','deep'])assert.equal(jobs.validateSolveInput({...input,teachingMode:mode}).teachingMode,mode);
for(const mode of ['correction','bad',null,{}])assert.throws(()=>jobs.validateSolveInput({...input,teachingMode:mode}));
const endpoint=load('app/api/teaching-mode/route.ts',{
 'next/server':{NextResponse:{json:(body,options)=>({body,options,status:options?.status||200})}},
 '@/lib/solve-jobs':{...jobs,jobStudent:async()=>{if(!authenticated)throw new jobs.SolveInputError('login',401);return {id:'student'};}},
 '@/lib/teaching-engine':engine,
});
const calls=[],logs=[];let scenario='single';
const slot={model:'test',provider:'openai'};
const router=load('lib/ai/router.ts',{
 '@/lib/solve-job-context':{solveJobContext:{getStore:()=>undefined}},
 '@/lib/teaching-images':{retrieveTeachingImages:async()=>({refs:[],images:[],prompt:''})},
 '@/lib/teaching-engine':engine,
 '@/lib/ai-settings':{getAISolverSettings:async()=>({mode:scenario==='single'?'single':'multi',primary:{model:slot},verifier:{model:slot},arbiter:{model:slot},arbitration:{confidenceThreshold:85}})},
 '@/lib/ai/solver':{runSolver:async({prompt})=>{
  calls.push(prompt);
  const verifier=prompt.includes('只判斷')||prompt.includes('verdict');
  return {provider:'openai',model:'test',text:JSON.stringify(verifier?{verdict:scenario==='verifier-error'?'major_error':'approve',confidence:99,concern:'check'}:{answer:scenario==='reference-mismatch'?'C':'B',explanation:'步驟',keyReview:'觀念',annotations:[]})};
 }},
 '@/lib/ai/usage-log':{saveSolverUsage:async data=>logs.push(data)},
 '@/lib/input-guard':{},
});
(async()=>{
 let response=await endpoint.GET({});assert.equal(response.body.mode,'concise');assert.deepEqual(Object.keys(response.body),['mode']);assert.equal(response.options.headers['Cache-Control'],'no-store');
 defaultMode='correction';assert.equal((await endpoint.GET({})).body.mode,'standard');
 authenticated=false;assert.equal((await endpoint.GET({})).status,401);authenticated=true;
 defaultMode='concise';
 for(scenario of ['single','reference-match','reference-mismatch','verifier-approve','verifier-error']){
  calls.length=0;logs.length=0;
  const result=await router.runAIRouter({...input,studentId:'student',campus:'test',teachingMode:'deep',referenceAnswer:scenario.startsWith('reference')?'B':undefined},{requestId:'req',gate:{allowed:true,category:'chemistry',confidence:100}});
  assert.equal(result.route.teachingMode,'deep',scenario);
  assert.ok(calls.every(p=>p.includes('本題解說深度契約：深度解析')),scenario);
  assert.ok(calls.every(p=>!p.includes('本題解說深度契約：精簡解答')),scenario);
  assert.ok(logs.every(x=>x.metadata.teachingMode==='deep'),scenario);
  if(scenario==='reference-mismatch'||scenario==='verifier-error')assert.equal(result.route.arbiterTriggered,true,scenario);
 }
 scenario='single';
 const legacy=await router.runAIRouter({...input,studentId:'student',campus:'test'},{requestId:'legacy',gate:{allowed:true,category:'chemistry'}});
 assert.equal(legacy.route.teachingMode,'concise');
 const context=await engine.buildTeachingContext('chemistry',{}, {...engine.DEFAULT_TEACHING_ENGINE_SETTINGS,mode:'deep'});
 assert.ok(context.includes('資訊不足時不得猜測'));assert.ok(context.includes('保留必要單位'));assert.ok(context.includes('教師規則庫'));
 console.log('PASS teaching depth: whitelist, defaults/auth, 3 distinct contracts, all 5 router paths, arbiter consistency, usage trace and teacher guardrails');
})().catch(e=>{console.error(e);process.exitCode=1;});
