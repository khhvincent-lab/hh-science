const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
let allowed=true,loggedIn=true,writes=[];
const db={from(table){let inserted;const query={select(){return query;},eq(){return query;},insert(rows){inserted=rows;writes.push(...rows);return query;},maybeSingle:async()=>({data:table==='classes'?{id:'class',institution_id:'institution',name:'高一班'}:table==='institutions'?{id:'institution',region_id:'region',name:'測試補習班'}:{id:'region',name:'測試地區'},error:null}),then(resolve){resolve({data:inserted?inserted.map((row,index)=>({...row,id:String(index)})):[{name:'王小明'}],error:null});}};return query;}};
const exportsObject={};
const source=ts.transpileModule(fs.readFileSync('app/api/admin/students/bulk/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(source,{exports:exportsObject,Buffer,File,console,require(id){if(id==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};if(id.includes('supabase-admin'))return {supabaseAdmin:db};if(id.includes('admin-access'))return {requireAdminSession:async()=>loggedIn?{role:'teacher'}:null,assertClassAccess:async()=>allowed};if(id.includes('student-auth'))return {getStudentAuthSettings:async()=>({initialPin:'123456'}),hashStudentPin:async()=> 'test-hash'};return require(id);}});
async function request(names,action='preview'){const data=new FormData();for(const [key,value] of Object.entries({regionId:'region',institutionId:'institution',classId:'class',action,namesText:names}))data.set(key,value);return exportsObject.POST({formData:async()=>data});}
(async()=>{
 const preview=await request('王小明\n陳小華\r\n\n陳小華\n林小美');assert.equal(preview.status,200);assert.equal(preview.body.preview.importableCount,2);assert.equal(preview.body.preview.existing.length,1);assert.equal(preview.body.preview.duplicateInFile.length,1);assert.equal(writes.length,0);
 const result=await request('王小明\n陳小華\n林小美','import');assert.equal(result.body.inserted,2);assert.equal(writes.every(row=>row.must_change_pin===true&&row.class_id==='class'&&row.pin_hash==='test-hash'),true);
 allowed=false;const denied=await request('張小新','import');assert.equal(denied.status,403);assert.equal(writes.length,2);allowed=true;
 const empty=await request(' \n\r\n');assert.equal(empty.status,400);
 const large=await request(Array.from({length:501},(_,i)=>`學生${i}`).join('\n'));assert.equal(large.status,400);
 const invalid=await request('王'.repeat(41));assert.equal(invalid.body.preview.invalid.length,1);assert.equal(invalid.body.preview.importableCount,0);
 loggedIn=false;assert.equal((await request('學生')).status,401);
 console.log('14 bulk student input, preview, import and access checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
