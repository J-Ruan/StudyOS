import { cleanup, render, waitFor, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Focus, { TimerRuntime } from '../src/pages/Focus';
import { db, initialSettings, resetData } from '../src/lib/db';
import { startTimer, pauseTimer, elapsedSeconds } from '../src/lib/actions';
import * as actions from '../src/lib/actions';
import { DataContext, UIContext, type Data, type UI } from '../src/lib/context';
import { NATIVE_RESUME_EVENT } from '../src/lib/native';
import type { Timer } from '../src/lib/models';

let now = new Date('2026-10-20T10:00:00Z').getTime();
beforeEach(async () => {
  await resetData();
  now = new Date('2026-10-20T10:00:00Z').getTime();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(async () => {
  cleanup();
  await resetData();
});

function mount(timer: Timer, page = false) {
  const data: Data = {
    courses: [],
    tasks: [],
    exams: [],
    habits: [],
    checks: [],
    sessions: [],
    overrides: [],
    materials: [],
    reviews: [],
    settings: { ...initialSettings, sound: false },
    timer,
  };
  const ui: UI = {
    open: vi.fn(),
    close: vi.fn(),
    notify: vi.fn(),
    confirm: vi.fn(),
    focus: vi.fn(),
  };
  render(
    <UIContext.Provider value={ui}>
      <DataContext.Provider value={data}>
        {page ? <Focus path="/focus" /> : <TimerRuntime />}
      </DataContext.Provider>
    </UIContext.Provider>,
  );
  return ui;
}

function resumeAfter(seconds: number) {
  now += seconds * 1000;
  act(() => {
    window.dispatchEvent(new Event(NATIVE_RESUME_EVENT));
  });
}

it('reconciles an expired countdown on native resume without an interval and saves only once', async () => {
  await startTimer('pomodoro', 25 * 60);
  const timer = (await db.timer.get('active'))!;
  const listen = vi.spyOn(window, 'addEventListener');
  const finish = vi.spyOn(actions, 'finishTimer');
  const ui = mount(timer);
  expect(listen).toHaveBeenCalledWith(NATIVE_RESUME_EVENT, expect.any(Function));
  resumeAfter(90 * 60);
  expect(finish).toHaveBeenCalledOnce();
  expect(elapsedSeconds(timer)).toBe(90 * 60);
  await waitFor(() =>
    expect(vi.mocked(ui.notify).mock.calls).toEqual([['专注完成，学习时间已保存']]),
  );
  await waitFor(async () => expect(await db.sessions.count()).toBe(1));
  expect((await db.sessions.get(timer.token))?.seconds).toBe(25 * 60);
  expect(await db.timer.get('active')).toBeUndefined();
  resumeAfter(1);
  await waitFor(() => expect(ui.notify).toHaveBeenCalledOnce());
  expect(await db.sessions.count()).toBe(1);
});

it('keeps paused elapsed time unchanged across a long background stay', async () => {
  await startTimer('custom', 60);
  now += 20000;
  await pauseTimer();
  mount((await db.timer.get('active'))!);
  resumeAfter(24 * 60 * 60);
  expect(await db.sessions.count()).toBe(0);
  expect((await db.timer.get('active'))?.elapsed).toBe(20);
  expect((await db.timer.get('active'))?.running).toBe(false);
});

it.each(['short', 'long'] as const)(
  'ends %s rest after resume without recording study time',
  async (mode) => {
    await startTimer(mode, 60);
    mount((await db.timer.get('active'))!);
    resumeAfter(3600);
    await waitFor(async () => expect(await db.timer.count()).toBe(0));
    expect(await db.sessions.count()).toBe(0);
  },
);

it('immediately refreshes a stopwatch display from timestamps after resume', async () => {
  await startTimer('stopwatch', 60);
  mount((await db.timer.get('active'))!, true);
  expect(screen.getByRole('status', { name: '计时' })).toHaveTextContent('00:00');
  resumeAfter(125);
  expect(screen.getByRole('status', { name: '计时' })).toHaveTextContent('02:05');
  expect(await db.sessions.count()).toBe(0);
});
