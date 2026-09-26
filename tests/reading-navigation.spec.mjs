import {test,expect} from '@playwright/test';

for(const theme of ['midnight','nordic','aurora','gold','obsidian']) {
 test(`reading sections and anchored navigation: ${theme}`,async({page})=>{
  await page.addInitScript(t=>localStorage.setItem('hh-science-theme',t),theme);
  await page.goto('/chemistry/classroom-air');
  await expect(page.locator('.chem-article-hero')).toBeVisible();
  const surfaces=await page.locator('#reading,#concepts,#data,#practice').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  expect(new Set(surfaces).size).toBe(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.getByRole('link',{name:'04 練習',exact:true}).click();
  await expect(page.locator('#practice')).toBeInViewport();
  const top=await page.locator('.chem-topbar').boundingBox();
  const practice=await page.locator('#practice').boundingBox();
  expect(top.y).toBeGreaterThanOrEqual(-1);
  expect(practice.y).toBeGreaterThanOrEqual(top.y+top.height-1);
  await page.getByRole('radio',{name:'B. 懸浮粒子平均降低61%',exact:true}).check();
  await page.getByRole('radio',{name:'B. 19.5',exact:true}).check();
  await page.getByRole('radio',{name:'B. 控制人數與門窗等條件，多次比較開關設備的量測',exact:true}).check();
  await page.getByRole('button',{name:'查看成績與詳解'}).click();
  await expect(page.getByRole('status')).toContainText('本次答對 3／3 題');
 });
}

test('mobile dock remains on the viewport edge after scrolling',async({page},testInfo)=>{
 test.skip(testInfo.project.name!=='mobile','Mobile dock only');
 await page.addInitScript(()=>{
  localStorage.setItem('hh-science:first-use-tour:nav-test','1');
  localStorage.setItem('hh-science:add-home-guide-seen','1');
 });
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const bodies={
   '/api/auth/session':{authenticated:true,student:{id:'nav-test',name:'測試',classId:'test',allowedSubjects:['chemistry'],mustChangePin:false}},
   '/api/usage':{count:0,limit:10,remaining:10},
  };
  await route.fulfill({json:bodies[path]||{}});
 });
 await page.goto('/');
 const nav=page.getByRole('navigation',{name:'學生頁面導覽'});
 await expect(nav).toBeVisible();
 await expect(nav.locator('svg')).toHaveCount(3);
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const box=await nav.boundingBox();
 const size=page.viewportSize();
 expect(box.x).toBe(0);expect(Math.abs(box.width-size.width)).toBeLessThan(1);
 expect(Math.abs(box.y+box.height-size.height)).toBeLessThan(2);
 const styles=await nav.evaluate(n=>({bg:getComputedStyle(n).backgroundColor,filter:getComputedStyle(n).backdropFilter}));
 expect(styles.bg).not.toBe('rgba(0, 0, 0, 0)');expect(styles.filter).toBe('none');
});
