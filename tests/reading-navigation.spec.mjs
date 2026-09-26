import {test,expect} from '@playwright/test';

for(const theme of ['midnight','nordic','aurora','gold','obsidian']) {
 test(`reading sections and anchored navigation: ${theme}`,async({page})=>{
  await page.addInitScript(t=>localStorage.setItem('hh-science-theme',t),theme);
  await page.goto('/chemistry/classroom-air');
  await expect(page.locator('.chem-article-hero')).toBeVisible();
  const surfaces=await page.locator('#reading,#concepts,#data,#practice').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor));
  expect(new Set(surfaces).size).toBe(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await expect(page.locator('.chem-curriculum-tags li')).toHaveCount(3);
  expect(await page.locator('.chem-article>section').evaluateAll(nodes=>nodes.slice(0,4).map(n=>n.id))).toEqual(['reading','data','concepts','practice']);
  const dates=await page.locator('.chem-publication-meta dd').evaluateAll(nodes=>nodes.map(n=>({wrap:getComputedStyle(n).whiteSpace,width:n.scrollWidth,available:n.clientWidth})));
  for(const date of dates){expect(date.wrap).toBe('nowrap');expect(date.width).toBeLessThanOrEqual(date.available+1);}
  await page.getByRole('link',{name:'04 練習',exact:true}).click();
  await expect(page.locator('#practice')).toBeInViewport();
  const top=await page.locator('.chem-topbar').boundingBox();
  const practice=await page.locator('#practice').boundingBox();
  expect(top.y).toBeGreaterThanOrEqual(-1);
  expect(practice.y).toBeGreaterThanOrEqual(top.y+top.height-1);
  await expect(page.getByRole('radio')).toHaveCount(12);
  for(const [i,answer] of [1,3,0].entries()) {
   await page.locator('.chem-question').nth(i).getByRole('radio').nth(answer).check();
  }
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
 expect(box.height).toBeLessThanOrEqual(55);
 const styles=await nav.evaluate(n=>({bg:getComputedStyle(n).backgroundColor,filter:getComputedStyle(n).backdropFilter}));
 expect(styles.bg).not.toBe('rgba(0, 0, 0, 0)');expect(styles.filter).toBe('none');
});

test('compact metadata and questions fit a narrow phone',async({page})=>{
 await page.setViewportSize({width:320,height:720});
 await page.goto('/chemistry/seawater-magnesium');
 const meta=page.locator('.chem-publication-meta');
 expect(await meta.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
 await expect(page.locator('.chem-curriculum-tags')).toContainText('酸鹼鹽');
 await page.getByRole('link',{name:'04 練習',exact:true}).click();
 const card=page.locator('.chem-question').first();
 const box=await card.boundingBox();
 const title=await card.locator('h3').boundingBox();
 expect(title.y).toBeGreaterThan(box.y+5);
 expect(title.x).toBeGreaterThan(box.x+5);
 await card.getByRole('radio').nth(2).check();
 await expect(card.getByRole('radio').nth(2)).toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('article back button returns to article list before the lab',async({page})=>{
 await page.goto('/chemistry/classroom-air');
 const nav=page.getByRole('navigation',{name:'專欄導覽'});
 await nav.getByRole('link',{name:'文章列表',exact:true}).click();
 await expect(page).toHaveURL(/\/chemistry$/);
 await expect(nav.getByRole('link',{name:'解題首頁',exact:true})).toHaveAttribute('href','/');
 const bar=await page.locator('.chem-topbar').boundingBox();
 expect(bar.height).toBeLessThanOrEqual(50);
});
