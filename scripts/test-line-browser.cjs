// Production-build UI smoke test. LINE SDK/API are mocked; sends nothing.
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict'),fs=require('node:fs');
const cwd=process.cwd(),base='http://127.0.0.1:3026';
const image='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="160"><rect width="600" height="160" fill="white"/><text x="30" y="80" font-size="30">Question and solution</text></svg>').toString('base64');
const pack={requestId:'request-one',text:'【解題實驗室｜真人導師求助】\n學生：測試學生\n地區：高雄\n補習班：測試班\n班級：高三週五班\n學生疑問：第三個選項為什麼錯？',imageUrl:image,previewUrl:image,expiresAt:'2099-01-01T00:00:00Z'};
(async()=>{
 const server=spawn(process.execPath,[cwd+'/node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3026'],{cwd,env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SECRET_KEY:'local-test',SESSION_SECRET:'local-test'},stdio:'pipe'});let browser;
 try {
  await new Promise((resolve,reject)=>{server.stdout.on('data',b=>{if(/ready/i.test(b.toString()))resolve()});server.stderr.on('data',b=>process.stderr.write(b));server.on('exit',()=>reject(Error('server exited')));setTimeout(()=>reject(Error('start timeout')),20000).unref()});
  browser=await chromium.launch({executablePath:process.env.TEST_CHROMIUM||'/tmp/hh-chromium',args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-software-rasterizer']});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let releaseCleanup; const cleanupGate=new Promise(resolve=>{releaseCleanup=resolve});
  let mode='utou',bound=false,hasPending=true,changed=false,failSend=false;const calls=[];
  await page.route('https://static.line-scdn.net/liff/edge/2/sdk.js',route=>route.fulfill({contentType:'application/javascript',body:`window.testMessages=[];window.testClosed=0;window.liff={init:async()=>{},getIDToken:()=>"verified-by-test",isInClient:()=>${JSON.stringify(mode)}!=="external",getContext:()=>({type:${JSON.stringify(mode)}}),permission:{getGrantedAll:async()=>['openid','chat_message.write']},sendMessages:async messages=>{window.testMessages.push(messages);${failSend?'throw Error("unknown outcome")':''}},closeWindow:()=>{window.testClosed++}};`}));
  await page.route('**/api/**',async route=>{
   const path=new URL(route.request().url()).pathname,method=route.request().method();calls.push(path+':'+method);let status=200,data={};
   if(path==='/api/auth/login-options')data={regions:[{id:'r',name:'高雄'}],institutions:[{id:'i',name:'測試班',region_id:'r'}],classes:[{id:'c',name:'高三週五班',institution_id:'i'}]};
   if(path==='/api/auth/login'){assert.equal(route.request().postDataJSON().pin,'1234');data={student:{mustChangePin:false}}}
   if(path==='/api/line/binding'){bound=method!=='DELETE';data={ok:true}}
   if(path==='/api/line/pending'){
    if(!bound){status=409;data={code:'BIND_REQUIRED',error:'首次使用，請先綁定你的學生帳號。'}}
    else if(!hasPending){status=404;data={code:'NO_PENDING',error:'目前沒有待傳題目。'}}
    else if(changed&&route.request().postDataJSON().requestId){status=409;data={code:'CHANGED',error:'已有另一份待傳題目，請重新載入並確認內容，避免傳錯題。'}}
    else if(method==='DELETE'){await cleanupGate;hasPending=false;data={ok:true}}
    else data=pack;
   }
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(base+'/line/teacher',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'首次使用：綁定學生帳號'}).waitFor();
  await page.getByLabel('地區',{exact:true}).selectOption('r');await page.getByLabel('補習班',{exact:true}).selectOption('i');await page.getByLabel('班級',{exact:true}).selectOption('c');
  await page.getByLabel('學生姓名').fill('測試學生');await page.getByLabel('個人 PIN',{exact:true}).fill('1234');await page.getByRole('button',{name:'驗證並綁定我的 LINE'}).click();
  const send=page.getByRole('button',{name:'確認傳送',exact:true});await page.waitForFunction(()=>window.testClosed===1);
  for(const width of [320,390,768]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
  await page.setViewportSize({width:390,height:844});
  // Supply local Traditional Chinese font for screenshot only.
  if(fs.existsSync('/tmp/NotoSansCJKtc-Regular.otf')){await page.route('**/preview.otf',r=>r.fulfill({body:fs.readFileSync('/tmp/NotoSansCJKtc-Regular.otf'),contentType:'font/otf'}));await page.addStyleTag({content:'@font-face{font-family:PreviewTC;src:url("/preview.otf")}body{font-family:PreviewTC,sans-serif!important}'});await page.evaluate(()=>document.fonts.load('16px PreviewTC'))}
  await page.screenshot({path:'/tmp/line-pending-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'回 LINE 聊天室',exact:true}).waitFor();await page.waitForFunction(()=>window.testClosed===1);
  assert.equal(hasPending,true);const cleaned=page.waitForResponse(r=>r.url().endsWith('/api/line/pending')&&r.request().method()==='DELETE');releaseCleanup();await cleaned;
  const messages=await page.evaluate(()=>window.testMessages);assert.equal(messages.length,1);assert.equal(messages[0].length,2);assert.equal(messages[0][1].type,'image');assert.equal(hasPending,false);
  await page.reload({waitUntil:'domcontentloaded'});await page.getByText('目前沒有待傳題目。',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'首次使用：綁定學生帳號'}).count(),0);
  hasPending=true;pack.requestId='request-two';changed=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByText(/已有另一份待傳題目/).waitFor();assert.equal(await page.evaluate(()=>window.testMessages.length),0);
  changed=false;failSend=true;await page.reload({waitUntil:'domcontentloaded'});await page.getByText(/尚未取得傳送成功確認/).waitFor();assert.equal(hasPending,true);assert.equal(await page.evaluate(()=>window.testClosed),0);
  await page.reload({waitUntil:'domcontentloaded'});await page.getByText(/這題曾嘗試傳送/).waitFor();assert.equal(await page.evaluate(()=>window.testMessages.length),0);
  for(const value of ['external','group']){mode=value;await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('link',{name:'前往盧澔化學聊天室'}).waitFor();assert.equal(await send.count(),0)}
  assert.deepEqual(errors,[]);
  // Real route guards, not browser intercepts.
  assert.equal((await fetch(base+'/api/line/binding',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(base+'/api/line/pending',{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
  console.log('PASS: first-time login/bind, returning student skips login, automatic text+image after binding, uncertain send not repeated after reload, automatic close, cleared pending, changed question blocked, uncertain send preserved, external/group blocked, 320/390/768 widths, no JS errors, actual 401/403 guards. Mock LINE, no messages sent.');
 }finally{await browser?.close();server.kill('SIGTERM')}
})().catch(error=>{console.error(error);process.exitCode=1});
