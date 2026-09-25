// Isolated route tests: no network, real students or LINE messages.
const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict'),Module=require('node:module');
const {NextRequest}=require('next/server');
process.env.SESSION_SECRET='isolated-line-test';
function load(file,mocks={}){const m=new Module(process.cwd()+'/'+file);m.filename=process.cwd()+'/'+file;m.paths=Module._nodeModulePaths(process.cwd());const original=m.require.bind(m);m.require=n=>n in mocks?mocks[n]:original(n);m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,m.filename);return m.exports;}
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',h='33333333-3333-4333-8333-333333333333',nonce='44444444-4444-4444-8444-444444444444';
const line='U'+'a'.repeat(32),otherLine='U'+'b'.repeat(32);
const rows={students:[{id:a,name:'A',active:true,must_change_pin:false,pin_changed_at:null},{id:b,name:'B',active:true,must_change_pin:false,pin_changed_at:null}],student_line_bindings:[],student_line_pending:[]};
let allowed=true;
const db={rpc:async()=>({data:[{allowed}],error:null}),from(table){let filters=[],action='select',value;const matches=r=>filters.every(([k,v])=>r[k]===v);const q={select(){return q},eq(k,v){filters.push([k,v]);return q},insert(v){action='insert';value=v;return q},update(v){action='update';value=v;return q},delete(){action='delete';return q},async maybeSingle(){return {data:rows[table].find(matches)||null,error:null}},then(resolve,reject){return Promise.resolve().then(()=>{if(action==='insert'){if(rows[table].some(r=>r.student_id===value.student_id||r.line_user_id===value.line_user_id))return {error:{code:'23505'}};rows[table].push(value)}else if(action==='update'){rows[table].filter(matches).forEach(r=>Object.assign(r,value))}else if(action==='delete'){rows[table]=rows[table].filter(r=>!matches(r))}return {error:null}}).then(resolve,reject)}};return q}};
let claims={aud:'2011732473',iss:'https://access.line.me',sub:line,exp:Math.floor(Date.now()/1000)+300};
global.fetch=async(url,options)=>{assert.equal(url,'https://api.line.me/oauth2/v2.1/verify');assert.equal(options.body.get('client_id'),'2011732473');return new Response(JSON.stringify(claims),{status:options.body.get('id_token')==='bad'?400:200,headers:{'content-type':'application/json'}})};
const identity=load('lib/line-identity.ts',{'@/lib/supabase-admin':{supabaseAdmin:db}});
const tokens=load('lib/line-handoff-token.ts');
const mocks={'@/lib/supabase-admin':{supabaseAdmin:db},'@/lib/line-identity':identity,'@/lib/line-handoff-token':tokens,'@/lib/session':{verifySessionToken:t=>t==='A'?{studentId:a}:t==='B'?{studentId:b}:null},'@/lib/line-handoff-read':{readHandoff:async token=>identity.lineJson({requestId:tokens.verifyHandoffToken(token).nonce,text:'only own package'})}};
const binding=load('app/api/line/binding/route.ts',mocks),pending=load('app/api/line/pending/route.ts',mocks);
const request=(body={},cookie='A',origin='https://example.test')=>new NextRequest('https://example.test/api/line/test',{method:'POST',headers:{origin,cookie:'hh_science_session='+cookie,'content-type':'application/json'},body:JSON.stringify({idToken:'valid',...body})});
(async()=>{
 assert.equal((await pending.POST(request())).status,409); // unbound
 assert.equal((await binding.POST(request({confirm:true},'invalid'))).status,401);
 assert.equal((await binding.POST(request({confirm:true},'A','https://evil.test'))).status,403);
 assert.equal((await binding.POST(request({confirm:false}))).status,400);
 assert.equal((await binding.POST(request({confirm:true,idToken:'bad'}))).status,401);
 const valid={...claims};claims.aud='wrong';assert.equal((await binding.POST(request({confirm:true}))).status,401);claims={...valid,exp:1};assert.equal((await binding.POST(request({confirm:true}))).status,401);claims=valid;
 assert.equal((await binding.POST(request({confirm:true}))).status,200);
 assert.equal((await binding.POST(request({confirm:true},'B'))).status,409); // can't switch student silently
 claims={...valid,sub:otherLine};assert.equal((await binding.POST(request({confirm:true}))).status,409); // unique student
 claims=valid;assert.equal((await pending.POST(request())).status,404);
 const token=tokens.createHandoffToken({studentId:a,historyId:h,nonce,exp:Math.floor(Date.now()/1000)+300});
 rows.student_line_pending.push({student_id:a,token,expires_at:new Date(Date.now()+300000).toISOString()});
 assert.equal((await pending.POST(request({},'B'))).status,200); // LINE identity, not browser cookie, determines owner
 const read=await (await pending.POST(request())).json();assert.equal(read.requestId,nonce);
 assert.equal((await pending.POST(request({requestId:'different'}))).status,409);
 assert.equal((await pending.DELETE(request({requestId:'different'}))).status,409);assert.equal(rows.student_line_pending.length,1);
 rows.students[0].active=false;assert.equal((await pending.POST(request())).status,403);rows.students[0].active=true;
 rows.students[0].pin_changed_at='2026-09-25T00:00:00Z';assert.equal((await pending.POST(request())).status,409);
 assert.equal((await binding.POST(request({confirm:true}))).status,200);assert.equal((await pending.POST(request())).status,200);
 rows.student_line_pending[0].token=tokens.createHandoffToken({studentId:b,historyId:h,nonce,exp:Math.floor(Date.now()/1000)+300});assert.equal((await pending.POST(request())).status,410);rows.student_line_pending[0].token=token;
 rows.student_line_pending[0].expires_at='2000-01-01T00:00:00Z';assert.equal((await pending.POST(request())).status,404);rows.student_line_pending[0].expires_at=new Date(Date.now()+300000).toISOString();
 allowed=false;assert.equal((await pending.POST(request())).status,429);allowed=true;
 assert.equal((await pending.DELETE(request({requestId:nonce}))).status,200);assert.equal(rows.student_line_pending.length,0);
 assert.equal((await binding.DELETE(request())).status,200);assert.equal((await pending.POST(request())).status,409);
 console.log('PASS: LINE signature-verification endpoint/audience/expiry, CSRF/session/consent, binding uniqueness, identity isolation, PIN reset/account revocation, expiry/tamper, stale-preview guard, compare-delete, rate limit, unlink.');
})().catch(error=>{console.error(error);process.exit(1)});
