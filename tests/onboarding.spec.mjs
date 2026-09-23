import { test, expect } from '@playwright/test';

const studentId = 'onboarding-test';
const dialog = page => page.getByRole('dialog', { name: '解題實驗室使用教學', exact: true });
const setupTitles = ['先從這裡加入題目圖片', '再選擇題目科目', '有答案就填上', '需要時再補充', '開始解題'];
const resultTitles = ['先讀觀念詳解與解題脈絡', '詳解裡的關鍵數字與符號可以點', '選擇題再看選項解析', '看不懂的地方直接追問', '最後兩個按鈕也很重要', '之後都可以從右上角選單回來'];

async function mockApi(page, optional) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const bodies = {
      '/api/auth/session': { authenticated: true, student: { id: studentId, name: '導覽測試', campus: '高雄班', classId: 'class-test', allowedSubjects: ['chemistry'], mustChangePin: false } },
      '/api/usage': { count: 0, limit: 10, remaining: 10 },
      '/api/auth/login-options': { regions: [{ id: 'region-test', name: '高雄' }], institutions: [{ id: 'institution-test', region_id: 'region-test', name: '測試補習班' }], classes: [{ id: 'class-test', institution_id: 'institution-test', name: '測試班', allowed_subjects: ['chemistry'] }] },
      '/api/solve': { answer: 'B', explanation: optional ? '根據公式，質量為 $\\htmlData{annotation=a1}{2}$ 公克。' : '根據題目條件，答案為 B。', options: optional ? 'A 錯誤。B 正確。' : '', annotations: optional ? [{ id: 'a1', display: '2', label: '質量', meaning: '題目給的質量', source: '題目', usage: '代入公式' }] : [], historyId: optional ? 'history-test' : null },
    };
    await route.fulfill({ json: bodies[path] || {} });
  });
}

async function checkStep(page, title, view) {
  await expect(dialog(page).getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.locator('main.student-page')).toHaveAttribute('data-view', view);
  const button = dialog(page).getByRole('button', { name: /下一步|開始自己試試看|完成導覽/ });
  await expect(button).toBeEnabled();
  await expect(page.locator('.student-guided-tour-spotlight')).toBeVisible();
  const box = await dialog(page).boundingBox();
  const size = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
}
async function next(page) { await dialog(page).getByRole('button', { name: '下一步', exact: true }).click(); }

for (const optional of [true, false]) {
  test('complete onboarding with ' + (optional ? 'annotations and options' : 'no optional sections or history ID'), async ({ page }) => {
    await mockApi(page, optional);
    await page.goto('/');
    for (let i = 0; i < setupTitles.length; i++) {
      await checkStep(page, setupTitles[i], 'solve');
      if (i < setupTitles.length - 1) await next(page);
    }
    await dialog(page).getByRole('button', { name: '開始自己試試看' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole('dialog', { name: '加入主畫面教學' })).toBeHidden();
    await page.getByRole('button', { name: '前往上傳', exact: true }).click();
    await expect(page.locator('.student-first-action-nudge')).toBeHidden();

    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 500;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 800, 500);
      ctx.fillStyle = 'black'; ctx.font = '36px sans-serif';
      ctx.fillText('Chemistry: 2 + 2 = ?', 50, 120); ctx.fillText('A: 3     B: 4', 50, 200);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('[data-tour="upload-zone"] input').setInputFiles({ name: 'question.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.getByRole('button', { name: '確認完成', exact: true }).click();
    await page.locator('[data-tour="solve-button"]').click();
    const titles = optional ? resultTitles : resultTitles.filter((_, index) => index !== 1 && index !== 2);
    for (let i = 0; i < titles.length; i++) {
      await checkStep(page, titles[i], 'result');
      if (i === 1) {
        await dialog(page).getByRole('button', { name: '上一步' }).click();
        await checkStep(page, titles[0], 'result');
        await next(page);
        await checkStep(page, titles[1], 'result');
      }
      if (i < titles.length - 1) await next(page);
    }
    await dialog(page).getByRole('button', { name: '完成導覽' }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('main.student-page')).toHaveAttribute('data-view', 'result');
    await expect.poll(() => page.evaluate(id => localStorage.getItem('hh-science:first-use-tour:' + id), studentId)).toBe('1');
    if (test.info().project.name === 'mobile') {
      const install = page.getByRole('dialog', { name: '加入主畫面教學' });
      await expect(install).toBeVisible();
      await install.getByRole('button', { name: '×', exact: true }).click();
    }

    // Manual replay must cross the setup/result boundary in both directions.
    await page.locator('[data-tour="menu-button"]').click();
    await page.getByRole('button', { name: /使用教學/ }).click();
    for (let i = 0; i < setupTitles.length; i++) {
      await checkStep(page, setupTitles[i], 'solve');
      await next(page);
    }
    await checkStep(page, titles[0], 'result');
    await dialog(page).getByRole('button', { name: '上一步' }).click();
    await checkStep(page, setupTitles[4], 'solve');
    await next(page);
    await checkStep(page, titles[0], 'result');
    await dialog(page).getByRole('button', { name: '略過', exact: true }).click();
    await page.reload();
    await expect(page.getByText('導覽測試', { exact: true })).toBeVisible();
    await expect(dialog(page)).toBeHidden();
  });
}
