import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
for (const width of [360, 375, 390, 412, 432])
  test(`Android bundled resources at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const failures: string[] = [];
    page.on('pageerror', (e) => failures.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
    });
    const destinations: string[] = [];
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      if (host !== '127.0.0.1' && host !== 'localhost') {
        destinations.push(host);
        return route.abort();
      }
      return route.continue();
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
    for (const path of [
      '/schedule',
      '/schedule/tasks',
      '/schedule/exams',
      '/schedule/plan',
      '/focus',
      '/stats',
      '/stats/habits',
      '/me',
      '/me/semester',
    ]) {
      await page.evaluate((p) => {
        location.hash = p;
      }, path);
      await expect(page.locator('main')).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        path,
      ).toBe(true);
    }
    await page.evaluate(() => {
      location.hash = '/me';
    });
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(
      await page.evaluate(async () =>
        navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0,
      ),
    ).toBe(0);
    expect(failures).toEqual([]);
    expect(destinations).toEqual([]);
  });
test('Web backup migrates to the Android bundle origin without shared storage or duplicate import', async ({
  context,
}) => {
  const web = await context.newPage();
  await web.goto('http://127.0.0.1:4173/StudyOS/#/schedule/tasks');
  await web.getByRole('button', { name: '新建任务', exact: true }).click();
  await web.getByLabel('任务标题').fill('跨平台迁移任务');
  await web.getByRole('button', { name: '保存', exact: true }).click();
  await expect(web.getByRole('dialog')).toHaveCount(0);
  await web.goto('http://127.0.0.1:4173/StudyOS/#/me');
  const waiting = web.waitForEvent('download');
  await web.getByRole('button', { name: '导出备份', exact: true }).click();
  const backup = await readFile((await (await waiting).path())!);
  const app = await context.newPage();
  await app.goto('http://127.0.0.1:4175/#/schedule/tasks');
  await expect(app.getByText('没有符合条件的任务')).toBeVisible();
  await app.goto('http://127.0.0.1:4175/#/me');
  for (let n = 0; n < 2; n++) {
    await app
      .getByLabel('导入备份')
      .setInputFiles({ name: 'web-backup.json', mimeType: 'application/json', buffer: backup });
    await app.getByRole('button', { name: '确认恢复', exact: true }).click();
    await expect(app.getByRole('dialog')).toHaveCount(0);
  }
  await app.goto('http://127.0.0.1:4175/#/schedule/tasks');
  await expect(app.getByText('跨平台迁移任务', { exact: true })).toHaveCount(1);
  await app.reload();
  await expect(app.getByText('跨平台迁移任务', { exact: true })).toBeVisible();
});
