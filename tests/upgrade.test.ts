import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import Dexie from 'dexie';
import { db, resetData, StudyDB } from '../src/lib/db';
import { taskSchema, preferences, type Task, type Course } from '../src/lib/models';
import { startTimer, pauseTimer, resumeTimer, advanceTimer } from '../src/lib/actions';
import { generatePlans, validatePlans, savePlans } from '../src/lib/planner';
import {
  parseCSV,
  readCourseFile,
  guessMapping,
  previewCourses,
  importCourses,
  coursesConflict,
} from '../src/lib/course-import';
import { exportBackup, importBackup, parseBackup } from '../src/lib/backup';
import { atTime } from '../src/lib/time';
const now = atTime('2026-11-09', '08:00');
const semester = {
  name: '秋季',
  start: '2026-11-09',
  end: '2027-03-01',
  weeks: 16,
  periods: [
    { start: '09:00', end: '09:45' },
    { start: '10:00', end: '10:45' },
    { start: '14:00', end: '14:45' },
    { start: '15:00', end: '15:45' },
  ],
};
const task = (id = 't', due = now + 86400000, priority: Task['priority'] = 'medium'): Task =>
  taskSchema.parse({
    id,
    title: id,
    kind: 'todo',
    notes: '',
    due,
    priority,
    estimate: 30,
    done: false,
    repeat: 'none',
    subtasks: [],
  });
const course: Course = {
  id: 'c',
  name: '数学',
  teacher: '陈',
  room: 'A101',
  color: '#a47bbe',
  slots: [{ id: 's', day: 1, start: 1, end: 2, from: 1, to: 16, parity: 'all' }],
};
const base = () => ({
  courses: [course],
  tasks: [task()],
  exams: [],
  overrides: [],
  plans: [],
  settings: { id: 'main' as const, theme: 'system' as const, sound: false, semester },
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await resetData();
});
afterEach(() => vi.restoreAllMocks());
describe('番茄阶段与可靠结算', () => {
  async function cycle(auto = true) {
    await db.settings.put({
      id: 'main',
      theme: 'system',
      sound: false,
      preferences: {
        ...preferences({}),
        rounds: 2,
        focusMinutes: 1,
        shortMinutes: 1,
        longMinutes: 2,
        autoAdvance: auto,
      },
    });
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await startTimer('pomodoro', 60, 'c', 't', true);
    return (await db.timer.get('active'))!;
  }
  it('后台跨过完整一组：只记录两次专注、不记休息，重复回调幂等', async () => {
    const t = await cycle();
    const r = await advanceTimer(t.token, now + 20 * 60000);
    expect(r?.completed).toBe(true);
    expect(await db.sessions.count()).toBe(2);
    expect((await db.sessions.toArray()).reduce((n, s) => n + s.seconds, 0)).toBe(120);
    expect(await db.timer.count()).toBe(0);
    await advanceTimer(t.token, now + 86400000);
    expect(await db.sessions.count()).toBe(2);
  });
  it('手动循环完成后持久化下一休息阶段但不自动开始', async () => {
    const t = await cycle(false);
    await advanceTimer(t.token, now + 60001);
    const next = (await db.timer.get('active'))!;
    expect(next.mode).toBe('short');
    expect(next.running).toBe(false);
    expect(next.cycle?.round).toBe(1);
    expect(await db.sessions.count()).toBe(1);
    await advanceTimer(next.token, now + 86400000);
    expect(await db.sessions.count()).toBe(1);
  });
  it('阶段内暂停和长时间恢复不累计暂停，继续后从正确时间结算', async () => {
    const t = await cycle();
    vi.spyOn(Date, 'now').mockReturnValue(now + 30000);
    await pauseTimer();
    await advanceTimer(t.token, now + 3 * 3600000);
    expect(await db.sessions.count()).toBe(0);
    vi.spyOn(Date, 'now').mockReturnValue(now + 3 * 3600000);
    await resumeTimer();
    await advanceTimer(t.token, now + 3 * 3600000 + 30000);
    expect((await db.timer.get('active'))?.mode).toBe('short');
    expect((await db.sessions.toArray())[0].seconds).toBe(60);
  });
  it('并发到期回调不会重复生成阶段和专注记录', async () => {
    const t = await cycle();
    await Promise.all([advanceTimer(t.token, now + 60001), advanceTimer(t.token, now + 60001)]);
    expect(await db.sessions.count()).toBe(1);
    expect((await db.timer.get('active'))?.mode).toBe('short');
  });
});
describe('离线学习计划', () => {
  it('按临近截止和优先级分配，避开课程、考试、已有计划与过去', () => {
    const d = base();
    d.tasks = [task('urgent', now + 3 * 3600000, 'high'), task('later', now + 86400000)];
    const result = generatePlans(d, {
      start: '08:00',
      end: '18:00',
      days: 2,
      now: now + 15 * 60000,
    });
    expect(result.proposed[0].taskId).toBe('urgent');
    expect(result.proposed[0].start).toBe(now + 15 * 60000);
    for (const p of result.proposed) {
      expect(p.start).toBeGreaterThan(now);
      validatePlans([p], d, now);
    }
    expect(result.proposed[1].start).toBeGreaterThanOrEqual(result.proposed[0].end);
  });
  it('没有空闲或已经逾期时返回可理解的失败原因，保持原数据', () => {
    const d = base();
    d.tasks = [task('past', now - 1), { ...task('too-big'), estimate: 1440 }];
    const result = generatePlans(d, { start: '08:00', end: '09:00', days: 1, now });
    expect(result.proposed).toEqual([]);
    expect(result.skipped).toHaveLength(2);
    expect(d.plans).toEqual([]);
  });
  it('预览调整后重检冲突，原子保存，不覆盖用户已有计划', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const d = base();
    await db.settings.put(d.settings);
    await db.courses.add(course);
    await db.tasks.add(task());
    const p = {
      id: 'p',
      title: '练习',
      taskId: 't',
      start: now + 15 * 60000,
      end: now + 45 * 60000,
      done: false,
    };
    await savePlans([p]);
    expect(await db.plans.count()).toBe(1);
    await expect(savePlans([{ ...p, id: 'conflict' }])).rejects.toThrow('冲突');
    expect(await db.plans.count()).toBe(1);
    await expect(
      savePlans([
        { ...p, id: 'valid', start: now + 5 * 3600000, end: now + 6 * 3600000 },
        { ...p, id: 'broken', end: now },
      ]),
    ).rejects.toThrow();
    expect(await db.plans.count()).toBe(1);
  });
  it('已排任务不再生成，不修改其时间；超出截止的预览不能保存', () => {
    const d = {
      ...base(),
      plans: [
        {
          id: 'p',
          title: '已排',
          taskId: 't',
          start: now + 60000,
          end: now + 1800000,
          done: false,
        },
      ],
    };
    expect(generatePlans(d, { start: '08:00', end: '22:00', days: 7, now }).proposed).toEqual([]);
    expect(() =>
      validatePlans(
        [
          {
            id: 'x',
            title: '晚了',
            taskId: 't',
            start: now + 2 * 86400000,
            end: now + 2 * 86400000 + 1800000,
            done: false,
          },
        ],
        base(),
        now,
      ),
    ).toThrow('截止');
  });
});
describe('本地课程表导入', () => {
  const headers = [
    '课程名称',
    '任课教师',
    '教室',
    '星期',
    '开始节次',
    '结束节次',
    '起始教学周',
    '结束教学周',
    '单双周规则',
  ];
  const row = ['数学', '陈', 'A101', '一', '1', '2', '1', '16', '每周'];
  it('CSV 支持 BOM、CRLF、逗号、转义引号和多行；拒绝破损引号', () => {
    expect(parseCSV('\uFEFF名称,备注\r\n"数学,高阶","双""引号\n跨行"')).toEqual([
      ['名称', '备注'],
      ['数学,高阶', '双"引号\n跨行'],
    ]);
    expect(() => parseCSV('"broken')).toThrow('引号');
  });
  it('真实 XLSX 压缩文件离线解析，字段别名映射得到课程', async () => {
    const bytes = await readFile('tests/fixtures/courses.xlsx');
    const file = Object.assign(new Blob([bytes]), { name: 'courses.xlsx' }) as File;
    const rows = await readCourseFile(file);
    const preview = previewCourses(rows.slice(1), guessMapping(rows[0]), [], semester);
    expect(preview.errors).toEqual([]);
    expect(preview.courses[0].name).toBe('线性代数');
    expect(preview.courses[0].slots[0]).toMatchObject({ day: 2, start: 3, end: 4, parity: 'even' });
  });
  it('同课不重复导入，合并新时段且保留原课程 id 和关联', async () => {
    await db.settings.put(base().settings);
    await db.courses.add(course);
    const mapping = guessMapping(headers);
    const same = await importCourses([row], mapping, 'merge', false);
    expect(same.courses).toHaveLength(0);
    const extra = [...row];
    extra[3] = '二';
    await importCourses([extra], mapping, 'merge', false);
    await importCourses([extra], mapping, 'merge', false);
    expect(await db.courses.count()).toBe(1);
    expect((await db.courses.get('c'))?.slots).toHaveLength(2);
  });
  it('校验范围、重复和单双周冲突；有错误时不写入任何课程', async () => {
    await db.settings.put(base().settings);
    const mapping = guessMapping(headers);
    await expect(
      importCourses([row, [...row.slice(0, 4), '99', ...row.slice(5)]], mapping, 'merge', false),
    ).rejects.toThrow();
    expect(await db.courses.count()).toBe(0);
    expect(coursesConflict(course, { ...course, id: 'other' })).toBe(true);
    expect(
      coursesConflict(
        { ...course, slots: [{ ...course.slots[0], parity: 'odd' }] },
        { ...course, slots: [{ ...course.slots[0], parity: 'even' }] },
      ),
    ).toBe(false);
  });
  it('冲突课程必须确认跳过后才能导入，不覆盖已有课程', async () => {
    await db.settings.put(base().settings);
    await db.courses.add(course);
    const conflict = [...row];
    conflict[0] = '物理';
    await expect(importCourses([conflict], guessMapping(headers), 'merge', false)).rejects.toThrow(
      '冲突',
    );
    const result = await importCourses([conflict], guessMapping(headers), 'merge', true);
    expect(result.conflicts).toBe(1);
    expect(result.skipped).toBe(1);
    expect(await db.courses.count()).toBe(1);
  });
});
describe('v3 升级和历史备份保护', () => {
  it('v2 原库直接迁移，课程关联、时长、设置不变，自习迁入计划', async () => {
    const name = `v2-upgrade-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(2).stores({
      courses: 'id',
      tasks: 'id,courseId,due,&repeatKey',
      exams: 'id,at',
      habits: 'id',
      checks: 'id,habitId,date,[habitId+date]',
      sessions: 'id,start,taskId,courseId',
      settings: 'id',
      overrides: 'id,date,courseId',
      timer: 'id',
      materials: 'id,courseId',
      reviews: 'id',
    });
    await old.open();
    await old.table('courses').add(course);
    await old
      .table('tasks')
      .add({ ...task(), courseId: 'c', scheduledStart: now, scheduledEnd: now + 1800000 });
    await old.table('settings').put(base().settings);
    await old.table('sessions').add({
      id: 's',
      start: now,
      end: now + 60000,
      seconds: 60,
      segments: [{ start: now, end: now + 60000 }],
      taskId: 't',
      courseId: 'c',
      note: '',
    });
    old.close();
    const upgraded = new StudyDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(3);
    expect(await upgraded.courses.count()).toBe(1);
    expect((await upgraded.tasks.get('t'))?.courseId).toBe('c');
    expect((await upgraded.sessions.get('s'))?.seconds).toBe(60);
    expect((await upgraded.settings.get('main'))?.semester?.name).toBe('秋季');
    expect((await upgraded.plans.get('legacy:t'))?.start).toBe(now);
    await upgraded.delete();
  });
  it('v2 JSON 自动补 v3，反复合并不复制计划、循环键或累计时长', async () => {
    await db.tasks.add({ ...task(), scheduledStart: now, scheduledEnd: now + 1800000 });
    const raw = JSON.parse(await exportBackup());
    raw.version = 2;
    delete raw.data.plans;
    expect(parseBackup(JSON.stringify(raw)).version).toBe(3);
    await importBackup(JSON.stringify(raw), 'replace');
    await importBackup(JSON.stringify(raw), 'merge');
    await importBackup(JSON.stringify(raw), 'merge');
    expect(await db.tasks.count()).toBe(1);
    expect(await db.plans.count()).toBe(1);
  });
  it('偏好具有旧数据默认值，v3 导出完整恢复设置与计划', async () => {
    expect(preferences({}).focusMinutes).toBe(25);
    await db.settings.put({
      ...base().settings,
      preferences: { ...preferences({}), accent: 'teal', startPage: '/tasks', autoAdvance: true },
    });
    await db.plans.add({ id: 'p', title: '复习', start: now, end: now + 60000, done: false });
    const raw = await exportBackup();
    await resetData();
    await importBackup(raw, 'replace');
    expect((await db.settings.get('main'))?.preferences?.startPage).toBe('/tasks');
    expect(await db.plans.count()).toBe(1);
  });
});
it('数据库迁移中断会回滚旧版存储，之后可以无损重试', async () => {
  const name = `upgrade-abort-${crypto.randomUUID()}`;
  const stores = {
    courses: 'id',
    tasks: 'id,courseId,due,&repeatKey',
    exams: 'id,at',
    habits: 'id',
    checks: 'id,habitId,date,[habitId+date]',
    sessions: 'id,start,taskId,courseId',
    settings: 'id',
    overrides: 'id,date,courseId',
    timer: 'id',
    materials: 'id,courseId',
    reviews: 'id',
  };
  const old = new Dexie(name);
  old.version(2).stores(stores);
  await old.open();
  await old.table('tasks').put({ ...task(), scheduledStart: now, scheduledEnd: now + 60000 });
  old.close();
  const failing = new StudyDB(name);
  failing.plans.hook('creating', () => {
    throw Error('injected storage failure');
  });
  await expect(failing.open()).rejects.toThrow('injected storage failure');
  failing.close();
  const recovered = new Dexie(name);
  recovered.version(2).stores(stores);
  await recovered.open();
  expect(recovered.verno).toBe(2);
  expect((await recovered.table('tasks').get('t')).scheduledEnd).toBe(now + 60000);
  recovered.close();
  const retry = new StudyDB(name);
  await retry.open();
  expect(await retry.tasks.count()).toBe(1);
  expect(await retry.plans.count()).toBe(1);
  await retry.delete();
});
