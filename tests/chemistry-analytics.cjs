const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(path,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText,{exports,console,Date,Set,JSON,require:id=>mocks[id]||require(id)});return exports;}
const analytics=load('lib/chemistry-analytics.ts');
const a={id:'v1',slug:'a',student_id:'s1',viewed_at:'2026-01-01',completed_at:null};
const rows=[a,{...a,id:'v2',completed_at:'2026-01-02'},{...a,id:'v3',slug:'b',completed_at:'2026-01-02'},{...a,id:'v4',student_id:'s2'},{...a,id:'v5',student_id:null,completed_at:'2026-01-02'}];
assert.deepEqual(JSON.parse(JSON.stringify(analytics.summarizeReading(rows))),{views:5,studentViews:4,guestViews:1,readers:2,completers:1,conversion:50});
assert.equal(analytics.summarizeReading([]).conversion,null);
let loggedIn=true,allowedIds=['s1'],queries=[];
const db={from(table){let ids=null;const q={select(){return q},lt(){return q},gte(){return q},order(){return q},range(){return q},in(_,values){ids=values;return q},then(resolve){queries.push({table,ids});resolve({data:rows.filter(r=>!ids||ids.includes(r.student_id)),error:null});}};return q;}};
const next={NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
const admin=load('app/api/admin/chemistry-analytics/route.ts',{'next/server':next,'@/lib/admin-access':{requireAdminSession:async()=>loggedIn?{}:null,getAccessibleStudentIds:async()=>allowedIds},'@/lib/supabase-admin':{supabaseAdmin:db},'@/lib/chemistry-articles':{chemistryArticles:[{slug:'a',title:'A'},{slug:'b',title:'B'}]},'@/lib/chemistry-analytics':analytics});
const request=range=>({nextUrl:new URL(`https://test.local/api?range=${range}`)});
(async()=>{
 let res=await admin.GET(request('all'));assert.equal(res.status,200);assert.equal(res.body.totals.readers,1);assert.equal(res.body.includesGuests,false);assert.equal(res.body.totals.guestViews,0);assert.deepEqual(queries[0].ids,['s1']);
 allowedIds=[];queries=[];res=await admin.GET(request('all'));assert.equal(res.body.totals.views,0);assert.equal(queries.length,0);
 allowedIds=null;res=await admin.GET(request('all'));assert.equal(res.body.totals.readers,2);assert.equal(res.body.includesGuests,true);assert.equal(res.body.totals.guestViews,1);
 loggedIn=false;queries=[];assert.equal((await admin.GET(request('all'))).status,401);assert.equal(queries.length,0);loggedIn=true;
 assert.equal((await admin.GET(request('invalid'))).status,400);
 console.log('Chemistry analytics: deduplication, conversion, empty data, teacher scope, global scope and authorization passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
