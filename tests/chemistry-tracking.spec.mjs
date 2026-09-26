import {test,expect} from '@playwright/test';

test('article opens once and only a complete three-answer submission sends completion',async({page})=>{
 const events=[];
 await page.route('**/api/chemistry/events',async route=>{events.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
 await page.goto('/chemistry/classroom-air');
 await expect.poll(()=>events.filter(e=>e.event==='view').length).toBe(1);
 await expect(page.getByRole('button',{name:'完成三題後查看詳解'})).toBeDisabled();
 await page.locator('.chem-question').nth(0).getByRole('radio').nth(0).check();
 expect(events.filter(e=>e.event==='complete')).toHaveLength(0);
 for(const i of [1,2])await page.locator('.chem-question').nth(i).getByRole('radio').nth(0).check();
 await page.getByRole('button',{name:'查看成績與詳解'}).click();
 await expect.poll(()=>events.filter(e=>e.event==='complete').length).toBe(1);
 expect(events[1].visitId).toBe(events[0].visitId);expect(events[1].answers).toEqual([0,0,0]);
 expect(events[1].studentId).toBeUndefined();
 await page.getByRole('button',{name:'查看成績與詳解'}).click();
 await expect.poll(()=>events.length).toBe(3);expect(events[2].visitId).toBe(events[0].visitId);
});

test('tracking failure does not block explanations and can retry',async({page})=>{
 let failing=true;
 await page.route('**/api/chemistry/events',route=>route.fulfill({status:failing?503:200,json:failing?{error:'暫時失敗'}:{ok:true}}));
 await page.goto('/chemistry/classroom-air');
 for(const i of [0,1,2])await page.locator('.chem-question').nth(i).getByRole('radio').nth(0).check();
 await page.getByRole('button',{name:'查看成績與詳解'}).click();
 await expect(page.locator('.chem-feedback')).toHaveCount(3);
 await expect(page.getByRole('button',{name:'重試同步'})).toBeVisible();
 failing=false;await page.getByRole('button',{name:'重試同步'}).click();
 await expect(page.getByRole('button',{name:'重試同步'})).toHaveCount(0);
});

test('admin analytics presents distinct students and changes date range',async({page})=>{
 const ranges=[];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/admin/chemistry-analytics'){
   ranges.push(url.searchParams.get('range'));
   return route.fulfill({json:{range:'30',startAt:null,endAt:'2026-09-26T11:00:00Z',includesGuests:true,totals:{views:12,readers:5,completers:2,conversion:40,guestViews:3},articles:[{slug:'classroom-air',title:'教室空氣變乾淨了，怎麼用數據證明？',views:12,readers:5,completers:2,conversion:40}]}});
  }
  if(url.pathname==='/api/admin/session')return route.fulfill({json:{authenticated:true,user:{id:'test-teacher',role:'teacher',displayName:'測試教師'}}});
  return route.fulfill({json:{}});
 });
 await page.goto('/admin?section=chemistryAnalytics');
 await expect(page.getByRole('heading',{name:'專欄成效',exact:true})).toBeVisible();
 await expect(page.locator('.reading-analytics-conversion strong')).toHaveText('40%');
 await expect(page.locator('.reading-analytics-progress')).toContainText('5 人閱讀，其中 2 人完成練習');
 await page.locator('.reading-analytics-controls select').selectOption('7');
 await expect.poll(()=>ranges.at(-1)).toBe('7');
 await expect(page.locator('.reading-analytics table tbody tr')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
