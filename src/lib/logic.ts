import type { Course, Override, Settings, Task, Session, Habit, HabitCheck, Exam } from './models';
import { addDays, atTime, daysBetween, localDate, monday, weekday } from './time';
export interface Occurrence {
  key: string;
  course: Course;
  slotId?: string;
  date: string;
  start: number;
  end: number;
  room: string;
  adjusted: boolean;
  startAt: number;
  endAt: number;
}
export function teachingWeek(date: string, semester: Settings['semester']) {
  return semester ? Math.floor(daysBetween(monday(semester.start), date) / 7) + 1 : 0;
}
export function occurrences(
  date: string,
  courses: Course[],
  adjustments: Override[],
  semester: Settings['semester'],
): Occurrence[] {
  if (!semester) return [];
  const week = teachingWeek(date, semester);
  const make = (
    c: Course,
    start: number,
    end: number,
    room: string,
    key: string,
    slotId?: string,
    adjusted = false,
  ): Occurrence => ({
    key,
    course: c,
    date,
    start,
    end,
    room,
    slotId,
    adjusted,
    startAt: atTime(date, semester.periods[start - 1]?.start ?? '08:00'),
    endAt: atTime(date, semester.periods[end - 1]?.end ?? '22:30'),
  });
  const result: Occurrence[] = [];
  for (const c of courses) {
    for (const s of c.slots) {
      if (
        date < semester.start ||
        date > semester.end ||
        week < 1 ||
        week > semester.weeks ||
        s.day !== weekday(date) ||
        week < s.from ||
        week > s.to ||
        (s.parity === 'odd' && week % 2 === 0) ||
        (s.parity === 'even' && week % 2 === 1)
      )
        continue;
      if (
        adjustments.some(
          (o) => o.date === date && o.courseId === c.id && o.slotId === s.id && o.kind !== 'extra',
        )
      )
        continue;
      result.push(make(c, s.start, s.end, c.room, `${c.id}:${s.id}:${date}`, s.id));
    }
    for (const o of adjustments.filter(
      (o) =>
        o.courseId === c.id &&
        ((o.kind === 'extra' && o.date === date) || (o.kind === 'move' && o.targetDate === date)),
    ))
      result.push(make(c, o.start, o.end, o.room || c.room, o.id, o.slotId, true));
  }
  return result.sort((a, b) => a.startAt - b.startAt);
}
export const overlaps = (
  a: { startAt: number; endAt: number },
  b: { startAt: number; endAt: number },
) => a.startAt < b.endAt && b.startAt < a.endAt;
export function freeSlots(date: string, lessons: Occurrence[], tasks: Task[], exams: Exam[] = []) {
  const startAt = atTime(date, '08:00'),
    endAt = atTime(date, '22:00');
  const busy = [
    ...lessons.map((l) => ({ startAt: l.startAt, endAt: l.endAt })),
    ...tasks
      .filter((t) => !t.done && t.scheduledStart !== undefined && t.scheduledEnd !== undefined)
      .map((t) => ({ startAt: t.scheduledStart!, endAt: t.scheduledEnd! })),
    ...exams.filter((e) => !e.archived).map((e) => ({ startAt: e.at, endAt: e.at + 2 * 3600000 })),
  ]
    .filter((b) => b.endAt > startAt && b.startAt < endAt)
    .sort((a, b) => a.startAt - b.startAt);
  const free: { startAt: number; endAt: number }[] = [];
  let cursor = startAt;
  for (const b of busy) {
    if (b.startAt - cursor >= 30 * 60000) free.push({ startAt: cursor, endAt: b.startAt });
    cursor = Math.max(cursor, b.endAt);
  }
  if (endAt - cursor >= 30 * 60000) free.push({ startAt: cursor, endAt });
  return free;
}
export const sortTasks = (tasks: Task[]) =>
  [...tasks].sort(
    (a, b) =>
      ({ high: 0, medium: 1, low: 2 })[a.priority] - { high: 0, medium: 1, low: 2 }[b.priority] ||
      a.due - b.due,
  );
export function dailySeconds(sessions: Session[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of sessions)
    for (const segment of s.segments) {
      let cursor = segment.start;
      while (cursor < segment.end) {
        const key = localDate(cursor);
        const next = new Date(cursor);
        next.setHours(24, 0, 0, 0);
        const end = Math.min(segment.end, next.getTime());
        totals.set(key, (totals.get(key) ?? 0) + (end - cursor) / 1000);
        cursor = end;
      }
    }
  return totals;
}
export function rangeSeconds(sessions: Session[], from: string, to: string) {
  return [...dailySeconds(sessions)]
    .filter(([date]) => date >= from && date <= to)
    .reduce((sum, [, v]) => sum + v, 0);
}
export function habitStats(h: Habit, checks: HabitCheck[], today = localDate()) {
  const values = new Map(checks.filter((c) => c.habitId === h.id).map((c) => [c.date, c.value]));
  let total = 0,
    done = 0,
    streak = 0;
  for (let d = h.created; d <= today; d = addDays(d, 1))
    if (h.days.includes(weekday(d))) {
      total++;
      if ((values.get(d) ?? 0) >= h.target) done++;
    }
  let d = today;
  if (h.days.includes(weekday(d)) && (values.get(d) ?? 0) < h.target) d = addDays(d, -1);
  for (; d >= h.created; d = addDays(d, -1))
    if (h.days.includes(weekday(d))) {
      if ((values.get(d) ?? 0) >= h.target) streak++;
      else break;
    }
  return { rate: total ? Math.round((done / total) * 100) : 0, streak };
}
