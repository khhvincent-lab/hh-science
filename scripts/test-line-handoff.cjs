const fs = require('fs');
const ts = require(process.cwd() + '/node_modules/typescript');
const assert = require('node:assert/strict');
const Module = require('node:module');
process.env.SESSION_SECRET = 'test-only-secret-not-production';
function load(file, mocks={}) {
  const code = ts.transpileModule(fs.readFileSync(file,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod = new Module(process.cwd()+'/'+file); mod.filename=process.cwd()+'/'+file; mod.paths=Module._nodeModulePaths(process.cwd());
  const original=mod.require.bind(mod); mod.require=(name)=>name in mocks ? mocks[name] : original(name);
  mod._compile(code,mod.filename); return mod.exports;
}
const tokens=load('lib/line-handoff-token.ts');
const ids={studentId:'11111111-1111-4111-8111-111111111111',historyId:'22222222-2222-4222-8222-222222222222',nonce:'33333333-3333-4333-8333-333333333333',exp:Math.floor(Date.now()/1000)+300};
const token=tokens.createHandoffToken(ids);
assert.deepEqual(tokens.verifyHandoffToken(token),ids);
assert.equal(tokens.verifyHandoffToken(token+'x'),null);
assert.equal(tokens.verifyHandoffToken(tokens.createHandoffToken({...ids,exp:1})),null);
assert.equal(tokens.verifyHandoffToken(tokens.createHandoffToken({...ids,historyId:'../other'})),null);
let active=true, owns=true;
const blobs=new Map();
const storage={upload:async(p,b)=>{blobs.set(p,b);return {error:null};},download:async p=>({data:blobs.has(p)?new Blob([blobs.get(p)]):null,error:null}),remove:async paths=>{paths.forEach(p=>blobs.delete(p));return {error:null};},createSignedUrl:async p=>({data:blobs.has(p)?{signedUrl:'https://example.test/'+p}:null,error:null})};
const db={storage:{from:()=>storage},from:table=>{
 const filters={};const query={select:()=>query,eq:(k,v)=>{filters[k]=v;return query;},maybeSingle:async()=>({error:null,data:table==='students'?{name:'測試',campus:'測試班',active,must_change_pin:false}:owns&&filters.student_id===ids.studentId?{id:ids.historyId,answer:'B'}:null})};return query;
}};
const route=load('app/api/line/handoff/route.ts',{'@/lib/supabase-admin':{supabaseAdmin:db},'@/lib/session':{verifySessionToken:t=>t==='valid'?{studentId:ids.studentId}:null},'@/lib/line-handoff-token':tokens,'@/lib/line-liff':{TEACHER_LIFF_URL:'https://liff.line.me/test'}});
const {NextRequest}=require(process.cwd()+'/node_modules/next/server');
function post(cookie='valid',origin='https://example.test') {
 const form=new FormData();form.set('historyId',ids.historyId);form.set('question','Why?');
 for(const key of ['image','preview']) form.set(key,new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}),key+'.jpg');
 return new NextRequest('https://example.test/api/line/handoff',{method:'POST',headers:{origin,cookie:'hh_science_session='+cookie},body:form});
}
const put=t=>new NextRequest('https://example.test/api/line/handoff',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({token:t})});
(async()=>{
 assert.equal((await route.POST(post('invalid'))).status,401);
 assert.equal((await route.POST(post('valid','https://evil.test'))).status,403);
 owns=false;assert.equal((await route.POST(post())).status,404);owns=true;
 const first=await route.POST(post());assert.equal(first.status,200);const firstBody=await first.json();const share=new URL(firstBody.url).searchParams.get('handoff');
 const valid=await route.PUT(put(share));assert.equal(valid.status,200);const body=await valid.json();assert.match(body.text,/測試/);assert.match(body.imageUrl,/image.jpg/);
 assert.equal((await route.PUT(put(share+'x'))).status,410);
 active=false;assert.equal((await route.PUT(put(share))).status,410);active=true;
 owns=false;assert.equal((await route.PUT(put(share))).status,410);owns=true;
 assert.equal((await route.POST(post())).status,200);
 assert.equal((await route.PUT(put(share))).status,410);
 assert.equal(blobs.size,3);
 console.log('PASS: token tamper/expiry/path validation, session/CSRF/ownership, upload/read, inactive/deleted owner, replacement invalidation and cleanup. No LINE messages sent.');
})().catch(e=>{console.error(e);process.exit(1)});
