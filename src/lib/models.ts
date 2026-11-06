import { z } from 'zod';

export const id = () => crypto.randomUUID();
const key = z.string().min(1).max(200);
const text = z.string().max(10000);
const name = z.string().trim().min(1, '请填写名称').max(200);
export const dateKey = z.iso.date();
const stamp = z.number().finite().min(0).max(8640000000000000);
const minute = z.number().int().min(1).max(1440);
export const slotSchema = z
  .object({
    id: key,
    day: z.number().int().min(1).max(7),
    start: z.number().int().min(1).max(20),
    end: z.number().int().min(1).max(20),
    from: z.number().int().min(1).max(60),
    to: z.number().int().min(1).max(60),
    parity: z.enum(['all', 'odd', 'even']),
  })
  .refine((s) => s.end >= s.start && s.to >= s.from, '结束节次或周数不能早于开始');
export const courseSchema = z.object({
  id: key,
  name,
  teacher: text,
  room: text,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  slots: z.array(slotSchema).min(1).max(100),
});
export const taskSchema = z
  .object({
    id: key,
    title: name,
    kind: z.enum(['assignment', 'review', 'todo', 'study']),
    courseId: key.optional(),
    notes: text,
    due: stamp,
    priority: z.enum(['high', 'medium', 'low']),
    estimate: minute,
    done: z.boolean(),
    completedAt: stamp.optional(),
    subtasks: z.array(z.object({ id: key, title: name, done: z.boolean() })).max(200),
    repeat: z.enum(['none', 'daily', 'weekly', 'monthly']),
    repeatKey: key.optional(),
    parentId: key.optional(),
    scheduledStart: stamp.optional(),
    scheduledEnd: stamp.optional(),
  })
  .refine(
    (t) =>
      (t.scheduledStart === undefined && t.scheduledEnd === undefined) ||
      (t.scheduledStart !== undefined &&
        t.scheduledEnd !== undefined &&
        t.scheduledEnd > t.scheduledStart),
    '自习结束时间必须晚于开始时间',
  );
export const overrideSchema = z
  .object({
    id: key,
    date: dateKey,
    courseId: key,
    slotId: key.optional(),
    kind: z.enum(['cancel', 'move', 'extra']),
    targetDate: dateKey.optional(),
    start: z.number().int().min(1).max(20),
    end: z.number().int().min(1).max(20),
    room: text,
  })
  .refine((o) => o.end >= o.start && (o.kind !== 'move' || !!o.targetDate), '调课信息不完整');
export const examSchema = z.object({
  id: key,
  name,
  kind: z.enum(['final', 'english', 'computer', 'custom']),
  at: stamp,
  room: text,
  courseId: key.optional(),
  notes: text,
  taskIds: z.array(key),
  archived: z.boolean(),
});
export const habitSchema = z.object({
  id: key,
  name,
  kind: z.enum(['check', 'count', 'minutes']),
  target: z.number().int().min(1).max(10000),
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  created: dateKey,
});
export const checkSchema = z.object({
  id: key,
  habitId: key,
  date: dateKey,
  value: z.number().min(0).max(100000),
});
export const segmentSchema = z
  .object({ start: stamp, end: stamp })
  .refine((s) => s.end >= s.start, '无效时间区间');
export const sessionSchema = z
  .object({
    id: key,
    start: stamp,
    end: stamp,
    seconds: z.number().min(1).max(31536000),
    courseId: key.optional(),
    taskId: key.optional(),
    note: text,
    segments: z.array(segmentSchema).min(1).max(10000),
  })
  .superRefine((s, ctx) => {
    const segments = [...s.segments].sort((a, b) => a.start - b.start);
    if (
      s.end < s.start ||
      segments.some(
        (v, i) => v.start < s.start || v.end > s.end || (i > 0 && v.start < segments[i - 1].end),
      ) ||
      Math.abs(segments.reduce((sum, v) => sum + (v.end - v.start) / 1000, 0) - s.seconds) > 1
    )
      ctx.addIssue({ code: 'custom', message: '学习时长与时间区间不一致' });
  });
export const timerSchema = z.object({
  id: z.literal('active'),
  token: key,
  mode: z.enum(['pomodoro', 'custom', 'stopwatch', 'short', 'long']),
  goal: z.number().min(60).max(86400),
  running: z.boolean(),
  started: stamp,
  anchor: stamp,
  elapsed: z.number().min(0).max(31536000),
  courseId: key.optional(),
  taskId: key.optional(),
  segments: z.array(segmentSchema).max(10000),
});
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const settingsSchema = z.object({
  id: z.literal('main'),
  theme: z.enum(['light', 'dark', 'system']),
  sound: z.boolean(),
  semester: z
    .object({
      name,
      start: dateKey,
      end: dateKey,
      weeks: z.number().int().min(1).max(60),
      periods: z
        .array(z.object({ start: clock, end: clock }))
        .min(1)
        .max(20),
    })
    .refine(
      (s) =>
        s.end >= s.start &&
        s.periods.every((p, i) => p.end > p.start && (i === 0 || p.start >= s.periods[i - 1].end)),
      '请检查学期日期与节次时间',
    )
    .optional(),
});
export const materialSchema = z.object({
  id: key,
  courseId: key,
  name,
  url: z.string().max(4000).optional(),
  data: z.instanceof(Blob).optional(),
});
export const reviewSchema = z.object({ id: dateKey, note: text });
export type Course = z.infer<typeof courseSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Override = z.infer<typeof overrideSchema>;
export type Exam = z.infer<typeof examSchema>;
export type Habit = z.infer<typeof habitSchema>;
export type HabitCheck = z.infer<typeof checkSchema>;
export type Session = z.infer<typeof sessionSchema>;
export type Timer = z.infer<typeof timerSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Material = z.infer<typeof materialSchema>;
export type Review = z.infer<typeof reviewSchema>;
export const priorityNames = { high: '高', medium: '中', low: '低' };
export const kindNames = {
  assignment: '课程作业',
  review: '复习任务',
  todo: '普通待办',
  study: '学习任务',
};
export const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
export const defaultPeriods = [
  ['08:00', '08:45'],
  ['08:55', '09:40'],
  ['10:00', '10:45'],
  ['10:55', '11:40'],
  ['14:00', '14:45'],
  ['14:55', '15:40'],
  ['16:00', '16:45'],
  ['16:55', '17:40'],
  ['19:00', '19:45'],
  ['19:55', '20:40'],
  ['20:50', '21:35'],
  ['21:45', '22:30'],
].map(([start, end]) => ({ start, end }));
