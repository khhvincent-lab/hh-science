import {test,expect} from '@playwright/test';

for(const entry of ['return','home']){
 test(`completed question clears through ${entry} and stays cleared on reload`,async({page},testInfo)=>{
  test.skip(entry==='home'&&testInfo.project.name!=='mobile','Bottom home tab is mobile only');
  let job=null,acknowledged=false;
  await page.addInitScript(()=>{
   localStorage.setItem('hh-science:first-use-tour:reset-test','1');
   localStorage.setItem('hh-science:add-home-guide-seen','1');
  });
  await page.route('**/api/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;
   if(path==='/api/solve-jobs'){
    if(request.method()==='PATCH'){acknowledged=true;return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:{job:acknowledged?null:job}});
   }
   if(path==='/api/solve'){
    job={id:'reset-job',status:'succeeded',stage:'complete',images:request.postDataJSON().images,result:{answer:'B',explanation:'依據資料判斷，B 正確。',historyId:'kept-in-history'}};
    return route.fulfill({json:{job}});
   }
   const bodies={
    '/api/auth/session':{authenticated:true,student:{id:'reset-test',name:'測試',campus:'高雄班',classId:'test',allowedSubjects:['chemistry'],mustChangePin:false}},
    '/api/usage':{count:1,limit:10,remaining:9},
   };
   return route.fulfill({json:bodies[path]||{}});
  });
  await page.goto('/');
  const png=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=800;c.height=500;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,800,500);x.fillStyle='black';x.font='36px sans-serif';x.fillText('Chemistry question: 2 + 2 = ?',40,100);return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-tour="upload-zone"] input').setInputFiles({name:'question.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByRole('button',{name:'確認完成',exact:true}).click();
  await page.locator('[data-tour="reference-answer"] input').fill('B');
  await page.locator('[data-tour="question-note"] textarea').fill('請說明原因');
  await expect(page.getByRole('img',{name:/^題目圖片 /})).toHaveCount(1);
  await page.locator('[data-tour="solve-button"]').click();
  await expect(page.locator('.v2-result-status')).toHaveText('已完成');
  if(entry==='return')await page.getByRole('button',{name:'← 返回解題首頁',exact:true}).click();
  else await page.getByRole('navigation',{name:'學生頁面導覽'}).getByRole('button',{name:'首頁',exact:true}).click();
  await expect(page.locator('main.student-page')).toHaveAttribute('data-view','solve');
  expect(acknowledged).toBe(true);
  await expect(page.locator('[data-tour="reference-answer"] input')).toHaveValue('');
  await expect(page.locator('[data-tour="question-note"] textarea')).toHaveValue('');
  await expect(page.getByRole('img',{name:/^題目圖片 /})).toHaveCount(0);
  await page.reload();
  await expect(page.locator('main.student-page')).toHaveAttribute('data-view','solve');
  await expect(page.getByRole('img',{name:/^題目圖片 /})).toHaveCount(0);
 });
}

test('returning home preserves a running question',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('hh-science:first-use-tour:running-test','1');
  localStorage.setItem('hh-science:add-home-guide-seen','1');
 });
 let dismissed=false;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()==='PATCH')dismissed=true;
  const bodies={
   '/api/auth/session':{authenticated:true,student:{id:'running-test',name:'測試',classId:'test',allowedSubjects:['chemistry'],mustChangePin:false}},
   '/api/usage':{count:0,limit:10,remaining:10},
   '/api/solve-jobs':{job:{id:'running-job',status:'running',stage:'primary'}},
  };
  await route.fulfill({json:bodies[path]||{}});
 });
 await page.goto('/');
 await page.locator('[data-tour="reference-answer"] input').fill('C');
 await page.locator('.student-app-brand').click();
 await expect(page.locator('[data-tour="reference-answer"] input')).toHaveValue('C');
 expect(dismissed).toBe(false);
});
