import { db, type StudyDB } from './db';
import {
  id,
  planSchema,
  type StudyPlan,
  type Task,
  type Course,
  type Exam,
  type Override,
  type Settings,
} from './models';
import { occurrences, overlaps } from './logic';
import { addDays, atTime, localDate } from './time';

export interface PlanningData {
  tasks: Task[];
  courses: Course[];
  exams: Exam[];
  overrides: Override[];
  settings: Settings;
  plans?: StudyPlan[];
}
export function busyOn(date: string, d: PlanningData, excludedPlan?: string) {
  const plannedTasks = new Set((d.plans ?? []).map((p) => p.taskId));
  return [
    ...occurrences(date, d.courses, d.overrides, d.settings.semester),
    ...d.exams
      .filter((e) => !e.archived)
      .map((e) => ({ startAt: e.at, endAt: e.at + 2 * 3600000 })),
    ...(d.plans ?? [])
      .filter((p) => p.id !== excludedPlan)
      .map((p) => ({ startAt: p.start, endAt: p.end })),
    ...d.tasks
      .filter(
        (t) =>
          t.scheduledStart !== undefined && t.scheduledEnd !== undefined && !plannedTasks.has(t.id),
      )
      .map((t) => ({ startAt: t.scheduledStart!, endAt: t.scheduledEnd! })),
  ];
}
export function availableSlots(
  date: string,
  d: PlanningData,
  start = '08:00',
  end = '22:00',
  now = Date.now(),
) {
  const lower = Math.max(atTime(date, start), Math.ceil(now / 60000) * 60000),
    upper = atTime(date, end);
  if (upper <= lower) return [];
  const busy = busyOn(date, d)
    .filter((b) => b.endAt > lower && b.startAt < upper)
    .sort((a, b) => a.startAt - b.startAt);
  const free: { startAt: number; endAt: number }[] = [];
  let cursor = lower;
  for (const b of busy) {
    if (b.startAt > cursor) free.push({ startAt: cursor, endAt: Math.min(b.startAt, upper) });
    cursor = Math.max(cursor, b.endAt);
  }
  if (cursor < upper) free.push({ startAt: cursor, endAt: upper });
  return free;
}
export function generatePlans(
  d: PlanningData,
  options: { start: string; end: string; days: number; now?: number },
) {
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(options.start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(options.end) ||
    options.end <= options.start
  )
    throw Error('请设置有效的学习时间范围');
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 31)
    throw Error('计划范围须为 1–31 天');
  const now = options.now ?? Date.now();
  const working: PlanningData = { ...d, plans: [...(d.plans ?? [])] };
  const proposed: StudyPlan[] = [],
    skipped: { title: string; reason: string }[] = [];
  const assigned = new Set((d.plans ?? []).filter((p) => !p.done).map((p) => p.taskId));
  const tasks = d.tasks
    .filter(
      (t) =>
        !t.done &&
        !assigned.has(t.id) &&
        (t.scheduledStart === undefined || (d.plans ?? []).some((p) => p.taskId === t.id)),
    )
    .sort((a, b) => {
      const weight = { high: 4, medium: 2, low: 0 };
      return (
        a.due - weight[a.priority] * 3600000 - (b.due - weight[b.priority] * 3600000) ||
        a.id.localeCompare(b.id)
      );
    });
  for (const task of tasks) {
    if (task.due <= now) {
      skipped.push({ title: task.title, reason: '任务已逾期，请先调整截止时间' });
      continue;
    }
    let placed = false;
    for (let day = 0; day < options.days && !placed; day++) {
      const date = addDays(localDate(now), day);
      for (const slot of availableSlots(date, working, options.start, options.end, now)) {
        const end = slot.startAt + task.estimate * 60000;
        if (end > slot.endAt || end > task.due) continue;
        const p = {
          id: id(),
          title: task.title,
          taskId: task.id,
          courseId: task.courseId,
          start: slot.startAt,
          end,
          done: false,
        };
        proposed.push(p);
        working.plans!.push(p);
        placed = true;
        break;
      }
    }
    if (!placed)
      skipped.push({
        title: task.title,
        reason: '截止前没有足够的连续空闲时间，可缩短预计耗时或扩大时间范围',
      });
  }
  return { proposed, skipped };
}
export function validatePlans(plans: StudyPlan[], d: PlanningData, now = Date.now()) {
  const seen = new Set<string>();
  const working = {
    ...d,
    tasks: d.tasks.map((t) =>
      plans.some((p) => p.id === `legacy:${t.id}`)
        ? { ...t, scheduledStart: undefined, scheduledEnd: undefined }
        : t,
    ),
    plans: (d.plans ?? []).filter((p) => !plans.some((v) => v.id === p.id)),
  };
  for (const raw of plans) {
    const p = planSchema.parse(raw);
    if (seen.has(p.id)) throw Error('计划编号重复');
    seen.add(p.id);
    if (p.start < now) throw Error('计划不能安排在已经过去的时间');
    const task = p.taskId ? d.tasks.find((t) => t.id === p.taskId) : undefined;
    if (p.taskId && (!task || task.done)) throw Error('关联任务不存在或已完成');
    if (task && p.end > task.due) throw Error(`「${p.title}」安排晚于任务截止时间`);
    if (
      [
        ...busyOn(localDate(p.start), working),
        ...(localDate(p.end - 1) !== localDate(p.start)
          ? busyOn(localDate(p.end - 1), working)
          : []),
      ].some((b) => overlaps({ startAt: p.start, endAt: p.end }, b))
    )
      throw Error(`「${p.title}」与课程、考试或已有计划冲突`);
    working.plans.push(p);
  }
}
export async function savePlans(plans: StudyPlan[], database: StudyDB = db) {
  await database.transaction(
    'rw',
    [
      database.plans,
      database.tasks,
      database.courses,
      database.exams,
      database.overrides,
      database.settings,
    ],
    async () => {
      const d = {
        plans: await database.plans.toArray(),
        tasks: await database.tasks.toArray(),
        courses: await database.courses.toArray(),
        exams: await database.exams.toArray(),
        overrides: await database.overrides.toArray(),
        settings: (await database.settings.get('main')) ?? {
          id: 'main' as const,
          theme: 'system' as const,
          sound: true,
        },
      };
      validatePlans(plans, d);
      await database.plans.bulkPut(plans);
    },
  );
}
