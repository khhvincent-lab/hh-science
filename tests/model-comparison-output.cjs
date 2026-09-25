const fs=require('fs'),path=require('path'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict');
const cache={};function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(code,{exports,require(name){if(name==='@/lib/supabase-admin')return {};if(name.startsWith('@/'))return load(name.slice(2)+'.ts');if(name.startsWith('.'))return load(path.resolve(path.dirname(file),name)+'.ts');return require(name)},console});return exports;}
const {parseComparisonOutput:parse}=load('lib/comparison/output.ts');
assert(parse('{"answer":"A","explanation":"因為…"}').ok);
assert.equal(parse('{"answer":0,"explanation":"計算結果為零"}').result.answer,'0');
assert.equal(parse('not JSON').code,'invalid_json');
assert.equal(parse('{"answer":"A"}').code,'missing_explanation');
assert.equal(parse('{"answer":null,"explanation":"文字"}').code,'missing_answer');
assert.equal(parse('{"answer":"A","explanation":{}}').code,'missing_explanation');
assert(parse('```json\n{"answer":"A","explanation":"原因"}\n```').ok);
const {recoveryCounts:count}=load('lib/comparison/recovery.ts');
const old=[...Array.from({length:6},()=>({b_status:'succeeded'})),...Array.from({length:3},()=>({b_status:'failed',error:'模型回傳格式不完整'})),{b_status:'failed',not_called:'true'}];
let c=count(old);assert.equal(c.succeeded,0);assert(!c.blocked);
c=count([...old,{b_status:'failed',format_revision:'2',error:'模型回傳格式不完整'}]);assert(c.blocked);
const successful=[...old,{b_status:'succeeded',format_revision:'2'}];assert.equal(count(successful).succeeded,1);
assert(!count([...successful,{b_status:'failed',format_revision:'2'}]).blocked);
assert(count([...successful,...Array.from({length:3},()=>({b_status:'failed',format_revision:'2'}))]).blocked);
assert(count([{b_status:'failed',error:'provider denied'}]).blocked);
console.log('PASS: output validation, numeric zero, malformed/missing fields, revision canary, old-cost preservation and circuit breaker');
