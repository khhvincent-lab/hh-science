import { test, expect } from '@playwright/test';

async function setup(page, { defaultMode = 'concise', failDefaults = false, slowDefaults = false } = {}) {
  let studentId = 'depth-student', job = null, submitted;
  await page.addInitScript(() => {
    for (const id of ['depth-student', 'other-student']) localStorage.setItem(`hh-science:first-use-tour:${id}`, '1');
    localStorage.setItem('hh-science:add-home-guide-seen', '1');
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), pathname = new URL(request.url()).pathname;
    if (pathname === '/api/teaching-mode') {
      if (slowDefaults) await new Promise(resolve => setTimeout(resolve, 800));
      return route.fulfill({ status: failDefaults ? 503 : 200, json: { mode: defaultMode } });
    }
    if (pathname === '/api/solve') {
      submitted = request.postDataJSON();
      job = { id: 'depth-job', status: 'succeeded', stage: 'complete', result: { answer: 'B', explanation: '依據條件，B 正確。', ai: { teachingMode: submitted.teachingMode } } };
      return route.fulfill({ json: { job } });
    }
    if (pathname === '/api/solve-jobs') {
      if (request.method() === 'PATCH') { job = null; return route.fulfill({ json: { ok: true } }); }
      return route.fulfill({ json: { job } });
    }
    const bodies = {
      '/api/auth/session': { authenticated: true, student: { id: studentId, name: '測試學生', campus: '高雄班', classId: 'test', allowedSubjects: ['chemistry'], mustChangePin: false } },
      '/api/usage': { count: 0, limit: 10, remaining: 10 },
    };
    return route.fulfill({ json: bodies[pathname] || {} });
  });
  await page.goto('/');
  return { switchStudent: id => { studentId = id; }, submission: () => submitted };
}

test('three modes use teacher default, persist per student and submit selected depth', async ({ page }, testInfo) => {
  const state = await setup(page);
  const group = page.getByRole('group', { name: '解說深度' });
  await expect(group.getByRole('radio')).toHaveCount(3);
  await expect(group.getByRole('radio', { name: '精簡解答', exact: true })).toBeChecked();
  await group.getByText('深度解析', { exact: true }).click();
  await expect(group.getByRole('radio', { name: '深度解析', exact: true })).toBeChecked();
  await page.reload();
  await expect(group.getByRole('radio', { name: '深度解析', exact: true })).toBeChecked();
  state.switchStudent('other-student');
  await page.reload();
  await expect(group.getByRole('radio', { name: '精簡解答', exact: true })).toBeChecked();
  state.switchStudent('depth-student');
  await page.reload();
  await expect(group.getByRole('radio', { name: '深度解析', exact: true })).toBeChecked();
  const boxes = await group.locator('label').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { top: r.top, width: r.width, right: r.right }; }));
  expect(new Set(boxes.map(b => b.top)).size).toBe(1);
  expect(boxes.every(b => b.width > 70 && b.right <= page.viewportSize().width)).toBe(true);
  await group.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('depth-selector.png') });
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 800; c.height = 500;
    const x = c.getContext('2d'); x.fillStyle = 'white'; x.fillRect(0, 0, 800, 500); x.fillStyle = 'black'; x.font = '36px sans-serif'; x.fillText('Chemistry question: 2 + 2 = ?', 40, 100);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-tour="upload-zone"] input').setInputFiles({ name: 'question.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.getByRole('button', { name: '確認完成', exact: true }).click();
  await page.locator('[data-tour="solve-button"]').click();
  await expect(page.getByTestId('result-teaching-mode')).toHaveText('本題解說深度：深度解析');
  expect(state.submission().teachingMode).toBe('deep');
  await page.getByRole('button', { name: '← 返回解題首頁', exact: true }).click();
  await expect(group.getByRole('radio', { name: '深度解析', exact: true })).toBeChecked();
});

test('failed defaults remain usable with an explicit student choice', async ({ page }) => {
  await setup(page, { failDefaults: true });
  await expect(page.getByText('暫時無法讀取老師預設，請選擇解說深度。')).toBeVisible();
  await expect(page.locator('[data-tour="solve-button"]')).toBeDisabled();
  await page.getByRole('group', { name: '解說深度' }).getByText('標準詳解', { exact: true }).click();
  await expect(page.locator('[data-tour="solve-button"]')).toBeEnabled();
});

test('late default cannot overwrite student selection', async ({ page }) => {
  await setup(page, { slowDefaults: true });
  const group = page.getByRole('group', { name: '解說深度' });
  await group.getByText('深度解析', { exact: true }).click();
  await expect(group.getByRole('radio', { name: '深度解析', exact: true })).toBeChecked();
  await page.waitForTimeout(900);
  await expect(group.getByRole('radio', { name: '深度解析', exact: true })).toBeChecked();
});

test('blocked local storage does not prevent selecting a mode', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('hh-science:teaching-mode:')) throw new Error('blocked storage');
      return original.call(this, key, value);
    };
  });
  await setup(page);
  const group = page.getByRole('group', { name: '解說深度' });
  await group.getByText('深度解析', { exact: true }).click();
  await expect(group.getByRole('radio', { name: '深度解析', exact: true })).toBeChecked();
  await expect(page.locator('[data-tour="solve-button"]')).toBeEnabled();
});
