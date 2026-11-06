import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.use({ timezoneId: 'Asia/Shanghai' });
async function route(page: Page, path: string) {
  await page.goto(`/StudyOS/#${path}`);
  await expect(page.locator('main')).toBeVisible();
}
async function demo(page: Page) {
  await route(page, '/me');
  await page.getByRole('button', { name: '体验示例数据' }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '示例已添加' })).toBeVisible();
}
async function createTask(page: Page, title: string) {
  await route(page, '/schedule/tasks');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题').fill(title);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function records(page: Page, table: string) {
  return page.evaluate(
    async (table) =>
      new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open('studyos');
        request.onsuccess = () => {
          const db = request.result;
          const q = db.transaction(table, 'readonly').objectStore(table).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
        request.onerror = () => reject(request.error);
      }),
    table,
  );
}

test('空数据库、课程创建编辑、冲突和单次调课', async ({ page }) => {
  await route(page, '/');
  await expect(page.getByRole('heading', { name: '今天', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '设置学期', exact: true }).click();
  await page.getByLabel('学期名称').fill('2026 秋季');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await route(page, '/schedule');
  await page
    .locator('.page-heading')
    .getByRole('button', { name: '新建课程', exact: true })
    .click();
  await page.getByLabel('课程名称').fill('高等数学');
  await page.getByLabel('教室', { exact: true }).fill('A203');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.lesson').filter({ hasText: '高等数学' })).toHaveCount(1);
  await page
    .locator('.course-chips')
    .getByRole('button', { name: '高等数学', exact: true })
    .click();
  await page.getByLabel('课程名称').fill('高等数学 II');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.lesson').filter({ hasText: '高等数学 II' })).toHaveCount(1);
  await page
    .locator('.page-heading')
    .getByRole('button', { name: '新建课程', exact: true })
    .click();
  await page.getByLabel('课程名称').fill('数据结构');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.conflict')).toHaveCount(2);
  await page.locator('.lesson').filter({ hasText: '高等数学 II' }).click();
  await page.getByRole('button', { name: '调整这次课程' }).click();
  await page.getByLabel('调整类型').selectOption('move');
  const original = await page.getByLabel('原上课日期').inputValue();
  const moved = new Date(`${original}T12:00:00`);
  moved.setDate(moved.getDate() + 1);
  const target = `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, '0')}-${String(moved.getDate()).padStart(2, '0')}`;
  await page.getByLabel('调整至').fill(target);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.lesson').filter({ hasText: '高等数学 II' })).toContainText(
    '临时调整',
  );
  await page.getByRole('button', { name: '撤销调整', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.lesson').filter({ hasText: '高等数学 II' })).not.toContainText(
    '临时调整',
  );
  await page
    .locator('.course-chips')
    .getByRole('button', { name: '数据结构', exact: true })
    .click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.locator('.course-chips')).not.toContainText('数据结构');
});

test('任务完成与撤销、重复后续和筛选', async ({ page }) => {
  await createTask(page, '每日英语');
  await page.locator('.task-content').filter({ hasText: '每日英语' }).click();
  await page.getByLabel('重复规则').selectOption('daily');
  await page.getByLabel('子任务名称').fill('背 20 个单词');
  await page.getByRole('button', { name: '添加子任务', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '完成 每日英语', exact: true }).click();
  await page.getByRole('button', { name: '已完成', exact: true }).click();
  await page.getByRole('button', { name: '重新打开 每日英语', exact: true }).click();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await page.getByRole('button', { name: '完成 每日英语', exact: true }).click();
  const tasks = await records(page, 'tasks');
  expect(tasks).toHaveLength(2);
  expect(tasks.filter((t) => t.done)).toHaveLength(1);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await expect(page.getByText('每日英语', { exact: true })).toHaveCount(1);
  await page.getByLabel('搜索任务').fill('找不到');
  await expect(page.getByText('没有符合条件的任务')).toBeVisible();
});

test('计时跨页面、暂停、刷新恢复与任务累计，结束不自动完成任务', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-06T09:00:00+08:00') });
  await createTask(page, '专注练习');
  await page.locator('.task-content').filter({ hasText: '专注练习' }).click();
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await page.getByRole('button', { name: '正向计时', exact: true }).click();
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await page.clock.fastForward(65000);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  await expect(page.getByLabel('计时')).toHaveText('01:05');
  await page.clock.fastForward(30000);
  await expect(page.getByLabel('计时')).toHaveText('01:05');
  await page.reload();
  await expect(page.getByRole('button', { name: '继续', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect(page.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await page.clock.fastForward(45000);
  await page.locator('.sidebar nav').getByRole('link', { name: '首页', exact: true }).click();
  await expect(page.getByRole('button', { name: '专注中' })).toBeVisible();
  await page.getByRole('button', { name: '专注中' }).click();
  await page.getByRole('button', { name: '结束', exact: true }).click();
  await page.getByLabel('学习记录（可选）').fill('完成二叉树练习');
  await page.getByRole('button', { name: '保存并结束', exact: true }).click();
  const sessions = await records(page, 'sessions');
  expect(sessions).toHaveLength(1);
  expect(Number(sessions[0].seconds)).toBeGreaterThanOrEqual(110);
  expect(Number(sessions[0].seconds)).toBeLessThan(112);
  expect((await records(page, 'tasks'))[0].done).toBe(false);
  await route(page, '/focus/history');
  await expect(page.getByText(/完成二叉树练习/)).toBeVisible();
});

test('自定义倒计时离开页面后自动结束，休息不计入统计', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-06T10:00:00+08:00') });
  await route(page, '/focus');
  await page.getByRole('button', { name: '自定义', exact: true }).click();
  await page.getByLabel('专注分钟数').fill('1');
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await page.locator('.sidebar nav').getByRole('link', { name: '首页', exact: true }).click();
  await page.clock.fastForward(125000);
  await expect.poll(async () => (await records(page, 'sessions')).length).toBe(1);
  expect((await records(page, 'sessions'))[0].seconds).toBe(60);
  await route(page, '/focus');
  await page.getByRole('button', { name: '短休息', exact: true }).click();
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await page.clock.fastForward(301000);
  await expect.poll(async () => (await records(page, 'timer')).length).toBe(0);
  expect((await records(page, 'sessions')).length).toBe(1);
});

test('考试、三类习惯、资料文件、备份与重复导入', async ({ page }) => {
  await demo(page);
  await route(page, '/schedule/exams');
  await page.getByRole('button', { name: '新建考试', exact: true }).click();
  await page.getByLabel('考试名称').fill('英语四级');
  await page.getByLabel('考试时间').fill('2027-06-12T09:00');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.getByRole('heading', { name: '英语四级' })).toBeVisible();
  await route(page, '/stats/habits');
  await page.getByRole('button', { name: '新建习惯', exact: true }).first().click();
  await page.getByLabel('习惯名称').fill('练习 Python');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page
    .locator('.habit-card')
    .filter({ hasText: '练习 Python' })
    .getByRole('button', { name: '打卡', exact: true })
    .click();
  await expect(page.locator('.habit-card').filter({ hasText: '练习 Python' })).toContainText(
    '已完成',
  );
  await page
    .locator('.habit-card')
    .filter({ hasText: '每日阅读' })
    .getByRole('button', { name: '记录', exact: true })
    .click();
  await page.getByLabel('分钟数').fill('25');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await route(page, '/schedule');
  await page
    .locator('.course-chips')
    .getByRole('button', { name: '高等数学', exact: true })
    .click();
  await page.getByLabel('上传文件').setInputFiles({
    name: '复习.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('persistent notes'),
  });
  await expect(page.getByRole('button', { name: '复习.txt', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await route(page, '/me');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  const download = await downloaded;
  const raw = await readFile((await download.path())!, 'utf-8');
  const original = JSON.parse(raw);
  expect(original.data.materials[0].base64).toBe(
    Buffer.from('persistent notes').toString('base64'),
  );
  await page
    .getByLabel('导入备份')
    .setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '备份已恢复' })).toBeVisible();
  expect((await records(page, 'sessions')).length).toBe(original.data.sessions.length);
  expect((await records(page, 'checks')).length).toBe(2);
  await page.getByLabel('导入备份').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"bad":1}'),
  });
  await expect(page.getByRole('status').filter({ hasText: /不合法/ })).toBeVisible();
  expect((await records(page, 'tasks')).length).toBe(original.data.tasks.length);
});

for (const width of [360, 390, 768, 1280, 1920])
  test(`响应式 ${width}px：各页面和深色模式没有页面横向溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await demo(page);
    for (const path of [
      '/',
      '/schedule',
      '/schedule/tasks',
      '/schedule/exams',
      '/schedule/plan',
      '/focus',
      '/stats',
      '/stats/habits',
      '/stats/review',
      '/me',
      '/me/semester',
    ]) {
      await route(page, path);
      const sizes = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(sizes.scroll, `${path} overflow`).toBeLessThanOrEqual(sizes.client);
    }
    await route(page, '/me');
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await route(page, '/');
    await page.screenshot({ path: `test-results/home-${width}-dark.png`, fullPage: true });
    await route(page, '/schedule/tasks');
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('任务标题').fill('可操作的弹窗');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

test('生产版本 PWA 在仓库子路径下可离线启动及读取本地任务', async ({ page, context }) => {
  await createTask(page, '离线仍可编辑');
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!reg.active) throw Error('service worker not active');
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('离线仍可编辑', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '完成 离线仍可编辑', exact: true }).click();
  await expect(page.getByText('没有符合条件的任务')).toBeVisible();
  await context.setOffline(false);
});

test('跨设备时区以当地日期展示同一绝对时刻，不丢失学习时长', async ({ browser }) => {
  for (const timezoneId of ['Asia/Shanghai', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    await route(page, '/me');
    const start = Date.parse('2026-11-06T23:30:00Z'),
      end = start + 3600000;
    const raw = JSON.stringify({
      app: 'StudyOS',
      version: 2,
      exportedAt: new Date().toISOString(),
      data: {
        courses: [],
        tasks: [],
        exams: [],
        habits: [],
        checks: [],
        sessions: [
          {
            id: 'timezone-session',
            start,
            end,
            seconds: 3600,
            segments: [{ start, end }],
            note: '跨时区',
          },
        ],
        overrides: [],
        settings: [],
        reviews: [],
        materials: [],
      },
    });
    await page.getByLabel('导入备份').setInputFiles({
      name: 'timezone.json',
      mimeType: 'application/json',
      buffer: Buffer.from(raw),
    });
    await page.getByRole('button', { name: '确认恢复', exact: true }).click();
    await route(page, '/focus/history');
    await expect(page.locator('.history-row')).toContainText(
      timezoneId === 'Asia/Shanghai' ? '11/7' : '11/6',
    );
    expect((await records(page, 'sessions'))[0].seconds).toBe(3600);
    await context.close();
  }
});

test('自习安排使用课程与任务空闲区间，取消后归还时间', async ({ page }) => {
  await demo(page);
  await createTask(page, '安排一段自习');
  await route(page, '/schedule/plan');
  const tomorrow = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.getByLabel('自习日期').fill(tomorrow);
  await page.locator('.free-slot').first().click();
  await page.getByLabel('任务', { exact: true }).selectOption({ label: '安排一段自习 · 25 分钟' });
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.plan-row')).toContainText('安排一段自习');
  const t = (await records(page, 'tasks')).find((t) => t.title === '安排一段自习')!;
  expect(Number(t.scheduledEnd) - Number(t.scheduledStart)).toBe(25 * 60000);
  await page.getByRole('button', { name: '取消自习安排' }).click();
  await expect(page.getByText('还没有安排自习')).toBeVisible();
});

test('无损取消删除、习惯次数型和键盘弹窗焦点', async ({ page }) => {
  await createTask(page, '保留我的任务');
  await page.locator('.task-content').filter({ hasText: '保留我的任务' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '任务详情', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByText('保留我的任务', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  await route(page, '/stats/habits');
  await page.getByRole('button', { name: '新建习惯', exact: true }).first().click();
  await page.getByLabel('习惯名称').fill('单词练习');
  await page.getByLabel('类型', { exact: true }).selectOption('count');
  await page.getByLabel('每日目标（次）').fill('3');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('button', { name: '记录', exact: true }).click();
  await page.getByLabel('完成次数').fill('3');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await expect(page.locator('.habit-summary')).toContainText('100%');
});

test('学习记录只改备注时保留暂停区间，改时长后统计更新，删除后移除统计', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-06T12:00:00+08:00') });
  await route(page, '/me');
  const start = Date.parse('2026-11-06T09:00:00+08:00'),
    end = start + 20 * 60000;
  const originalSegments = [
    { start, end: start + 5 * 60000 },
    { start: end - 5 * 60000, end },
  ];
  const raw = JSON.stringify({
    app: 'StudyOS',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      courses: [],
      tasks: [],
      exams: [],
      habits: [],
      checks: [],
      sessions: [
        { id: 'editable', start, end, seconds: 600, segments: originalSegments, note: '原始笔记' },
      ],
      overrides: [],
      settings: [],
      reviews: [],
      materials: [],
    },
  });
  await page.getByLabel('导入备份').setInputFiles({
    name: 'records.json',
    mimeType: 'application/json',
    buffer: Buffer.from(raw),
  });
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await route(page, '/focus/history');
  await page.locator('.history-row').click();
  await page.getByRole('textbox', { name: '学习记录', exact: true }).fill('新笔记');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await records(page, 'sessions'))[0].segments).toEqual(originalSegments);
  await page.locator('.history-row').click();
  await page.getByLabel('有效时长（分钟）').fill('5');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  expect((await records(page, 'sessions'))[0].seconds).toBe(300);
  await route(page, '/stats');
  await page.getByRole('button', { name: '今日', exact: true }).click();
  await expect(page.locator('.stats-overview').first()).toContainText('5');
  await route(page, '/focus/history');
  await page.locator('.history-row').click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await expect(page.getByText('还没有学习记录')).toBeVisible();
  expect((await records(page, 'sessions')).length).toBe(0);
});

test('夏令时回拨重复的当地时刻按真实一小时统计', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'America/New_York' });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-11-06T12:00:00-05:00') });
  await route(page, '/me');
  const start = Date.parse('2026-11-01T01:30:00-04:00'),
    end = Date.parse('2026-11-01T01:30:00-05:00');
  const raw = JSON.stringify({
    app: 'StudyOS',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      courses: [],
      tasks: [],
      exams: [],
      habits: [],
      checks: [],
      sessions: [
        { id: 'dst', start, end, seconds: 3600, segments: [{ start, end }], note: '夏令时回拨' },
      ],
      overrides: [],
      settings: [],
      reviews: [],
      materials: [],
    },
  });
  await page
    .getByLabel('导入备份')
    .setInputFiles({ name: 'dst.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await route(page, '/stats');
  await page.getByRole('button', { name: '每月', exact: true }).click();
  await expect(page.locator('.stats-overview>div').first()).toContainText('1h0m');
  await expect(page.locator('.has-study').first()).toContainText('60m');
  await context.close();
});
