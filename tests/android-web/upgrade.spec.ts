import { test, expect, type Page } from '@playwright/test';
async function route(page: Page, path: string) {
  await page.goto(`/#${path}`);
  await expect(page.locator('main')).toBeVisible();
}
async function rows(page: Page, table: string) {
  return page.evaluate(
    (table) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const req = indexedDB.open('studyos');
        req.onsuccess = () => {
          const db = req.result,
            q = db.transaction(table).objectStore(table).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
        req.onerror = () => reject(req.error);
      }),
    table,
  );
}
async function task(page: Page, name: string) {
  await route(page, '/tasks');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题').fill(name);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test.use({ timezoneId: 'Asia/Shanghai' });
test('mobile primary navigation, day/three-day/week timetable and bulk task controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await route(page, '/');
  const nav = page.getByRole('navigation', { name: '移动导航' });
  await expect(nav.getByRole('link')).toHaveText(['今天', '课程', '任务', '专注', '我的']);
  await route(page, '/me/semester');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await route(page, '/schedule');
  await expect(page.getByRole('button', { name: '今日', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: '下一段日期' }).click();
  const date = await page.getByLabel('课表日期').inputValue();
  await page.getByRole('button', { name: '三日', exact: true }).click();
  await expect(page.locator('.agenda-day')).toHaveCount(3);
  await page.getByRole('button', { name: '上一段日期' }).click();
  expect(await page.getByLabel('课表日期').inputValue()).not.toBe(date);
  await page.getByRole('button', { name: '周课表', exact: true }).click();
  await expect(page.locator('.timetable')).toBeVisible();
  await task(page, '批量一');
  await task(page, '批量二');
  await page.getByRole('button', { name: '批量选择', exact: true }).click();
  await page.getByLabel('选择 批量一', { exact: true }).check();
  await page.getByLabel('选择 批量二', { exact: true }).check();
  await page.getByRole('button', { name: '批量完成', exact: true }).click();
  await expect.poll(async () => (await rows(page, 'tasks')).filter((t) => t.done).length).toBe(2);
  await page.getByRole('button', { name: '已完成', exact: true }).click();
  await page.getByLabel('选择 批量一', { exact: true }).check();
  await page.getByRole('button', { name: '批量删除', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  expect(await rows(page, 'tasks')).toHaveLength(2);
  await page.getByRole('button', { name: '批量删除', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect.poll(async () => (await rows(page, 'tasks')).length).toBe(1);
});
test('CSV and real XLSX import use preview, explicit confirmation and repeat detection', async ({
  page,
}) => {
  await route(page, '/me/semester');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await route(page, '/schedule');
  const csv =
    '课程名称,教师,教室,星期,开始节次,结束节次,开始周,结束周,单双周\n数学,陈,A203,一,1,2,1,16,每周\n';
  for (let attempt = 0; attempt < 2; attempt++) {
    await page
      .getByLabel('导入课表')
      .setInputFiles({ name: 'courses.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    const dialog = page.getByRole('dialog', { name: '导入课程表' });
    await expect(dialog).toBeVisible();
    if (attempt === 0) {
      await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled();
      expect(await rows(page, 'courses')).toHaveLength(0);
      await page.getByLabel('已核对预览，确认写入这些课程').check();
      await page.getByRole('button', { name: '确认导入', exact: true }).click();
      await expect(dialog).toHaveCount(0);
    } else {
      await expect(dialog).toContainText('跳过 1');
      await page.getByRole('button', { name: '关闭', exact: true }).click();
    }
  }
  await page.getByLabel('导入课表').setInputFiles('tests/fixtures/courses.xlsx');
  await page.getByLabel('已核对预览，确认写入这些课程').check();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await rows(page, 'courses')).toHaveLength(2);
});
test('personal preferences survive restart and automatic pomodoro group records only focus', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-11-09T08:00:00+08:00') });
  await route(page, '/me');
  await page.getByLabel('启动页面').selectOption('/tasks');
  await page.getByLabel('强调色').selectOption('teal');
  await page.getByText('专注与休息', { exact: true }).click();
  await page.getByLabel('专注时长（分钟）', { exact: true }).fill('1');
  await page.getByLabel('短休息（分钟）', { exact: true }).fill('1');
  await page.getByLabel('长休息（分钟）', { exact: true }).fill('2');
  await page.getByLabel('每组专注轮数').fill('2');
  await page.getByLabel('自动进入下一阶段').check();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '任务', exact: true })).toBeVisible();
  await route(page, '/focus');
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await page.clock.fastForward(61000);
  await expect(page.locator('.cycle-stage')).toContainText('短休息');
  await page.clock.fastForward(5 * 60000);
  await expect.poll(async () => (await rows(page, 'timer')).length).toBe(0);
  const sessions = await rows(page, 'sessions');
  expect(sessions).toHaveLength(2);
  expect(sessions.reduce((n, s) => n + Number(s.seconds), 0)).toBe(120);
  await page.reload();
  expect(await rows(page, 'sessions')).toHaveLength(2);
});
test('rule-generated study plans require confirmation and remain editable', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-09T08:00:00+08:00') });
  await task(page, '离线计划任务');
  await route(page, '/schedule/plan');
  await page.getByRole('button', { name: '生成学习计划', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '学习计划预览' })).toBeVisible();
  expect(await rows(page, 'plans')).toHaveLength(0);
  await page.getByRole('button', { name: '确认保存计划', exact: true }).click();
  await expect(page.locator('.plan-row')).toContainText('离线计划任务');
  const plans = await rows(page, 'plans');
  expect(plans).toHaveLength(1);
  expect(Number(plans[0].end) - Number(plans[0].start)).toBe(25 * 60000);
  await page.getByRole('button', { name: '完成自习', exact: true }).click();
  await expect.poll(async () => (await rows(page, 'plans'))[0].done).toBe(true);
  expect((await rows(page, 'tasks'))[0].done).toBe(false);
});

test('首页一键开始真实计时，并可继续暂停的同一计时', async ({ page }) => {
  await route(page, '/');
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  const timer = (await rows(page, 'timer'))[0];
  expect(timer.running).toBe(true);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await route(page, '/');
  await page.getByRole('button', { name: '返回专注', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  expect((await rows(page, 'timer'))[0].token).toBe(timer.token);
});
