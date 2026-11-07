import { db } from './db';
import { preferences, id, type Task, type Timer, type Session } from './models';
import { nextDue } from './time';
export async function toggleTask(taskId: string) {
  return db.transaction('rw', db.tasks, async () => {
    const t = await db.tasks.get(taskId);
    if (!t) return;
    const done = !t.done;
    await db.tasks.update(t.id, { done, completedAt: done ? Date.now() : undefined });
    if (done && t.repeat !== 'none') {
      const repeatKey = `${t.id}:next`;
      if (!(await db.tasks.where('repeatKey').equals(repeatKey).first())) {
        const next: Task = {
          ...t,
          id: id(),
          done: false,
          completedAt: undefined,
          due: nextDue(t.due, t.repeat),
          subtasks: t.subtasks.map((s) => ({ ...s, id: id(), done: false })),
          parentId: t.id,
          repeatKey,
          reminders: t.reminders?.filter((r) => r.kind === 'before'),
          scheduledStart: undefined,
          scheduledEnd: undefined,
        };
        await db.tasks.add(next);
      }
    }
  });
}
export async function deleteCourse(courseId: string) {
  await db.transaction(
    'rw',
    [db.courses, db.tasks, db.exams, db.sessions, db.overrides, db.materials, db.timer, db.plans],
    async () => {
      await db.courses.delete(courseId);
      await db.tasks
        .where('courseId')
        .equals(courseId)
        .modify((row) => {
          delete row.courseId;
        });
      await db.exams.toCollection().modify((row) => {
        if (row.courseId === courseId) delete row.courseId;
      });
      await db.sessions
        .where('courseId')
        .equals(courseId)
        .modify((row) => {
          delete row.courseId;
        });
      await db.timer.toCollection().modify((row) => {
        if (row.courseId === courseId) delete row.courseId;
      });
      await db.plans
        .where('courseId')
        .equals(courseId)
        .modify((p) => {
          delete p.courseId;
        });
      await db.overrides.where('courseId').equals(courseId).delete();
      await db.materials.where('courseId').equals(courseId).delete();
    },
  );
}
export async function deleteTask(taskId: string) {
  await db.transaction('rw', [db.tasks, db.exams, db.sessions, db.timer, db.plans], async () => {
    await db.tasks.delete(taskId);
    await db.plans
      .where('taskId')
      .equals(taskId)
      .modify((p) => {
        delete p.taskId;
      });
    await db.sessions
      .where('taskId')
      .equals(taskId)
      .modify((s) => {
        delete s.taskId;
      });
    await db.timer.toCollection().modify((t) => {
      if (t.taskId === taskId) delete t.taskId;
    });
    await db.exams.toCollection().modify((e) => {
      e.taskIds = e.taskIds.filter((t) => t !== taskId);
    });
  });
}
export function elapsedSeconds(t: Timer, now = Date.now()) {
  return t.elapsed + (t.running ? Math.max(0, now - t.anchor) / 1000 : 0);
}
export function capturedSegments(t: Timer, now = Date.now()) {
  const remaining = t.mode === 'stopwatch' ? Infinity : Math.max(0, t.goal - t.elapsed);
  const end = Math.min(now, t.anchor + remaining * 1000);
  return [...t.segments, ...(t.running && end > t.anchor ? [{ start: t.anchor, end }] : [])];
}
export async function startTimer(
  mode: Timer['mode'],
  goal: number,
  courseId?: string,
  taskId?: string,
  cycle = false,
) {
  const now = Date.now();
  const prefs = preferences((await db.settings.get('main')) ?? {});
  await db.transaction('rw', db.timer, async () => {
    if (await db.timer.get('active')) throw Error('已有计时，请先结束当前计时');
    await db.timer.put({
      id: 'active',
      token: id(),
      mode,
      goal,
      running: true,
      started: now,
      anchor: now,
      elapsed: 0,
      segments: [],
      cycle:
        cycle && mode === 'pomodoro'
          ? {
              root: id(),
              round: 1,
              rounds: prefs.rounds,
              focus: goal / 60,
              short: prefs.shortMinutes,
              long: prefs.longMinutes,
              auto: prefs.autoAdvance,
            }
          : undefined,
      courseId,
      taskId,
    });
  });
}
export async function pauseTimer() {
  await db.transaction('rw', [db.timer, db.sessions], async () => {
    const t = await db.timer.get('active');
    if (!t || !t.running) return;
    if (t.mode !== 'stopwatch' && elapsedSeconds(t) >= t.goal) {
      if (t.cycle) await advanceTimer(t.token);
      else await finishTimer(true, '', t.token);
      return;
    }
    const segments = capturedSegments(t);
    await db.timer.update('active', {
      running: false,
      segments,
      elapsed: segments.reduce((n, s) => n + (s.end - s.start) / 1000, 0),
    });
  });
}
export async function resumeTimer() {
  await db.transaction('rw', db.timer, async () => {
    const t = await db.timer.get('active');
    if (t && !t.running) await db.timer.update('active', { running: true, anchor: Date.now() });
  });
}
export async function finishTimer(save: boolean, note = '', token?: string, now = Date.now()) {
  return db.transaction('rw', [db.timer, db.sessions], async () => {
    const t = await db.timer.get('active');
    if (!t || (token && t.token !== token)) return;
    const segments = capturedSegments(t, now);
    const seconds = segments.reduce((n, s) => n + (s.end - s.start) / 1000, 0);
    if (
      save &&
      seconds >= 1 &&
      t.mode !== 'short' &&
      t.mode !== 'long' &&
      !(await db.sessions.get(t.token))
    ) {
      const session: Session = {
        id: t.token,
        start: segments[0].start,
        end: segments[segments.length - 1].end,
        seconds,
        segments,
        courseId: t.courseId,
        taskId: t.taskId,
        note,
      };
      await db.sessions.add(session);
    }
    await db.timer.delete('active');
    return { recorded: save && seconds >= 1 && t.mode !== 'short' && t.mode !== 'long', seconds };
  });
}
export const safeURL = (url: string) => {
  try {
    const u = new URL(url);
    return ['https:', 'http:', 'obsidian:'].includes(u.protocol) ? u.href : undefined;
  } catch {
    return undefined;
  }
};

// A finite group ends after its long break; a stopped WebView never invents days of study.
export async function advanceTimer(token: string, now = Date.now()) {
  return db.transaction('rw', [db.timer, db.sessions], async () => {
    let t = await db.timer.get('active');
    if (!t || t.token !== token || !t.cycle) return;
    let recorded = 0,
      advanced = false;
    for (let phase = 0; phase < 25 && t && t.running && elapsedSeconds(t, now) >= t.goal; phase++) {
      const segments = capturedSegments(t, now);
      const seconds = segments.reduce((n, s) => n + (s.end - s.start) / 1000, 0);
      if (t.mode === 'pomodoro' && seconds >= 1 && !(await db.sessions.get(t.token))) {
        await db.sessions.add({
          id: t.token,
          start: segments[0].start,
          end: segments.at(-1)!.end,
          seconds,
          segments,
          courseId: t.courseId,
          taskId: t.taskId,
          note: '',
        });
        recorded++;
      }
      const c: NonNullable<Timer['cycle']> = t.cycle!;
      const end: number = t.anchor + Math.max(0, t.goal - t.elapsed) * 1000;
      if (t.mode === 'long') {
        await db.timer.delete('active');
        return { recorded, advanced: true, completed: true };
      }
      const mode: Timer['mode'] =
        t.mode === 'pomodoro' ? (c.round >= c.rounds ? 'long' : 'short') : 'pomodoro';
      const round: number = t.mode === 'short' ? c.round + 1 : c.round;
      const goal: number =
        (mode === 'pomodoro' ? c.focus : mode === 'short' ? c.short : c.long) * 60;
      t = {
        ...t,
        token: `${c.root}:${round}:${mode}`,
        mode,
        goal,
        started: end,
        anchor: end,
        running: c.auto,
        elapsed: 0,
        segments: [],
        cycle: { ...c, round },
      };
      await db.timer.put(t);
      advanced = true;
    }
    return { recorded, advanced, completed: false };
  });
}
export async function completeTask(taskId: string) {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(taskId);
    if (task && !task.done) await toggleTask(taskId);
  });
}
