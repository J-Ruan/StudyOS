import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { db, StudyDB, resetData } from '../src/lib/db';
import {
  toggleTask,
  deleteCourse,
  deleteTask,
  startTimer,
  pauseTimer,
  resumeTimer,
  finishTimer,
  elapsedSeconds,
  safeURL,
} from '../src/lib/actions';
import { exportBackup, importBackup, parseBackup } from '../src/lib/backup';
import { type Task, type Course } from '../src/lib/models';
const task: Task = {
  id: 't',
  title: '每日复习',
  kind: 'review',
  notes: '',
  due: new Date('2026-11-06T18:00:00').getTime(),
  priority: 'high',
  estimate: 25,
  done: false,
  subtasks: [{ id: 's', title: '阅读', done: true }],
  repeat: 'daily',
};
const course: Course = {
  id: 'c',
  name: '数学',
  teacher: '老师',
  room: 'A101',
  color: '#ad83c4',
  slots: [{ id: 's', day: 1, start: 1, end: 2, from: 1, to: 16, parity: 'all' }],
};
beforeEach(async () => {
  vi.restoreAllMocks();
  await resetData();
});
afterAll(async () => {
  await db.delete();
});
describe('任务和关联数据事务', () => {
  it('完成、重新打开、再次完成只生成一份后续重复待办', async () => {
    await db.tasks.add(task);
    await toggleTask('t');
    expect((await db.tasks.get('t'))?.done).toBe(true);
    await toggleTask('t');
    await toggleTask('t');
    const tasks = await db.tasks.toArray();
    expect(tasks).toHaveLength(2);
    expect(tasks.find((t) => t.parentId === 't')?.subtasks[0].done).toBe(false);
    expect(tasks.find((t) => t.parentId === 't')?.due).toBe(
      new Date('2026-11-07T18:00:00').getTime(),
    );
  });
  it('多个并发完成操作不会重复创建后续任务', async () => {
    await db.tasks.add(task);
    await Promise.all([toggleTask('t'), toggleTask('t'), toggleTask('t')]);
    expect(await db.tasks.count()).toBe(2);
  });
  it('课程 CRUD 且删除课程保留任务和学习记录', async () => {
    await db.courses.add(course);
    await db.courses.update('c', { room: 'B202' });
    expect((await db.courses.get('c'))?.room).toBe('B202');
    await db.tasks.add({ ...task, courseId: 'c' });
    await db.materials.add({ id: 'm', courseId: 'c', name: '资料', url: 'https://example.com' });
    await deleteCourse('c');
    expect(await db.courses.count()).toBe(0);
    expect((await db.tasks.get('t'))?.courseId).toBeUndefined();
    expect(await db.materials.count()).toBe(0);
  });
  it('删除任务会解除关联考试，但不会删除考试', async () => {
    await db.tasks.add(task);
    await db.exams.add({
      id: 'e',
      name: '考试',
      kind: 'final',
      at: Date.now(),
      room: '',
      notes: '',
      taskIds: ['t'],
      archived: false,
    });
    await deleteTask('t');
    expect((await db.exams.get('e'))?.taskIds).toEqual([]);
  });
});
describe('时间戳计时与恢复', () => {
  it('暂停不累计、恢复准确、跨页面读取与刷新后仍可计算', async () => {
    const spy = vi.spyOn(Date, 'now').mockReturnValue(100000);
    await startTimer('pomodoro', 1500, 'c', 't');
    spy.mockReturnValue(160000);
    await pauseTimer();
    expect((await db.timer.get('active'))?.elapsed).toBe(60);
    spy.mockReturnValue(360000);
    await resumeTimer();
    spy.mockReturnValue(480000);
    const restored = await db.timer.get('active');
    expect(elapsedSeconds(restored!)).toBe(180);
    await finishTimer(true, '已完成练习');
    const s = (await db.sessions.toArray())[0];
    expect(s.seconds).toBe(180);
    expect(s.segments).toHaveLength(2);
    expect(await db.timer.count()).toBe(0);
  });
  it('后台超时后仅记目标时间，并且只能保存一次', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100000);
    await startTimer('custom', 60);
    const token = (await db.timer.get('active'))!.token;
    await Promise.all([finishTimer(true, '', token, 300000), finishTimer(true, '', token, 300000)]);
    expect(await db.sessions.count()).toBe(1);
    expect((await db.sessions.toArray())[0].seconds).toBe(60);
  });
  it('休息时间和放弃计时都不计入学习', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(100000);
    await startTimer('short', 300);
    await finishTimer(true, '', undefined, 400000);
    await startTimer('stopwatch', 1500);
    await finishTimer(false, '', undefined, 400000);
    expect(await db.sessions.count()).toBe(0);
  });
  it('计时不自动完成关联任务，重复开始受保护', async () => {
    await db.tasks.add(task);
    vi.spyOn(Date, 'now').mockReturnValue(100000);
    await startTimer('custom', 60, 'c', 't');
    await expect(startTimer('custom', 60)).rejects.toThrow('已有计时');
    await finishTimer(true, '', undefined, 160000);
    expect((await db.tasks.get('t'))?.done).toBe(false);
  });
});
describe('备份验证与原子恢复', () => {
  it('业务数据与文件二进制完整往返，重复导入不重复累计', async () => {
    await db.courses.add(course);
    await db.tasks.add(task);
    await db.materials.add({
      id: 'm',
      courseId: 'c',
      name: '笔记.txt',
      data: new Blob(['hello'], { type: 'text/plain' }),
    });
    const backup = await exportBackup();
    expect(parseBackup(backup).data.materials[0].base64).toBe('aGVsbG8=');
    await resetData();
    await importBackup(backup, 'replace');
    await importBackup(backup, 'merge');
    expect(await db.tasks.count()).toBe(1);
    expect((await db.materials.get('m'))?.data?.size).toBe(5);
  });
  it('零字节资料也能完整备份', async () => {
    await db.materials.add({ id: 'empty', courseId: 'c', name: 'empty.txt', data: new Blob([]) });
    const raw = await exportBackup();
    await resetData();
    await importBackup(raw, 'replace');
    expect((await db.materials.get('empty'))?.data?.size).toBe(0);
  });
  it('非法单字段、未知版本和非法 JSON 都保护原数据', async () => {
    await db.tasks.add(task);
    const original = await exportBackup();
    const invalid = JSON.parse(original);
    invalid.data.tasks[0].due = '坏数据';
    await expect(importBackup(JSON.stringify(invalid), 'replace')).rejects.toThrow('不合法');
    expect((await db.tasks.get('t'))?.title).toBe(task.title);
    expect(() => parseBackup('{')).toThrow();
    expect(() => parseBackup(original.replace('"version":3', '"version":99'))).toThrow();
  });
  it('事务中途写入失败，会回滚先前清空与写入', async () => {
    await db.tasks.add(task);
    const backup = JSON.parse(await exportBackup());
    backup.data.courses = [course];
    const hook = () => {
      throw new Error('模拟配额写入失败');
    };
    db.courses.hook('creating', hook);
    try {
      await expect(importBackup(JSON.stringify(backup), 'replace')).rejects.toThrow('模拟配额');
      expect(await db.tasks.get('t')).toBeDefined();
      expect(await db.courses.count()).toBe(0);
    } finally {
      db.courses.hook('creating').unsubscribe(hook);
    }
  });
  it('合并恢复相同编号保留本机内容', async () => {
    await db.tasks.add(task);
    const backup = await exportBackup();
    await db.tasks.update('t', { title: '本机的新内容' });
    await importBackup(backup, 'merge');
    expect((await db.tasks.get('t'))?.title).toBe('本机的新内容');
  });
  it('迁移 v1 备份，补足有效区间与任务默认字段', async () => {
    const backup = JSON.parse(await exportBackup());
    backup.version = 1;
    backup.data.sessions = [{ id: 's', start: 100000, end: 160000, seconds: 60 }];
    backup.data.tasks = [{ ...task, repeat: undefined, subtasks: undefined }];
    const parsed = parseBackup(JSON.stringify(backup));
    expect(parsed.data.sessions[0].segments).toEqual([{ start: 100000, end: 160000 }]);
    expect(parsed.data.tasks[0].repeat).toBe('none');
  });
  it('禁止导入脚本链接及重复记录编号', async () => {
    const backup = JSON.parse(await exportBackup());
    backup.data.materials = [{ id: 'm', courseId: 'c', name: '危险', url: 'javascript:alert(1)' }];
    expect(() => parseBackup(JSON.stringify(backup))).toThrow();
    backup.data.materials = [];
    backup.data.tasks = [task, task];
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('重复编号');
    expect(safeURL('javascript:alert(1)')).toBeUndefined();
    expect(safeURL('obsidian://open?vault=Study')).toBeTruthy();
  });
  it('有活动计时则禁止备份或导入', async () => {
    const backup = await exportBackup();
    await startTimer('pomodoro', 1500);
    await expect(exportBackup()).rejects.toThrow('计时');
    await expect(importBackup(backup, 'replace')).rejects.toThrow('计时');
  });
  it('校验累计时长与有效区间，拒绝重叠统计', async () => {
    const backup = JSON.parse(await exportBackup());
    backup.data.sessions = [
      {
        id: 's',
        start: 1000,
        end: 10000,
        seconds: 15,
        note: '',
        segments: [
          { start: 1000, end: 10000 },
          { start: 2000, end: 8000 },
        ],
      },
    ];
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('不一致');
  });
});
describe('IndexedDB 版本升级', () => {
  it('v1 数据库升级至 v3 保留任务并补充旧记录区间', async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({
      courses: 'id',
      tasks: 'id,courseId,due',
      exams: 'id,at',
      habits: 'id',
      checks: 'id,habitId,date',
      sessions: 'id,start,taskId,courseId',
      settings: 'id',
      overrides: 'id,date,courseId',
      timer: 'id',
      materials: 'id,courseId',
      reviews: 'id',
    });
    await old.open();
    await old.table('tasks').add({ ...task, repeat: undefined, subtasks: undefined });
    await old.table('sessions').add({ id: 's', start: 100000, end: 160000, seconds: 60 });
    await old.table('checks').bulkAdd([
      { id: '1', habitId: 'h', date: '2026-11-06', value: 1 },
      { id: '2', habitId: 'h', date: '2026-11-06', value: 2 },
    ]);
    old.close();
    const upgraded = new StudyDB(name);
    await upgraded.open();
    expect((await upgraded.tasks.get('t'))?.repeat).toBe('none');
    expect((await upgraded.sessions.get('s'))?.segments).toHaveLength(1);
    expect(await upgraded.checks.count()).toBe(1);
    expect((await upgraded.checks.toArray())[0].value).toBe(2);
    await upgraded.delete();
  });
});
