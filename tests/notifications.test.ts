import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  native: vi.fn(() => true),
  pending: vi.fn(),
  delivered: vi.fn(),
  schedule: vi.fn(),
  cancel: vi.fn(),
  remove: vi.fn(),
  permission: vi.fn(),
  exact: vi.fn(),
  channels: vi.fn(),
  actions: vi.fn(),
}));
vi.mock('../src/lib/native', () => ({
  isNativeApp: mock.native,
  NATIVE_RESUME_EVENT: 'studyos:resume',
}));
vi.mock('../src/lib/device-tools', () => ({
  DeviceTools: {
    configureChannels: mock.channels,
    setStatusExpiry: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: mock.permission,
    checkExactNotificationSetting: mock.exact,
    getPending: mock.pending,
    getAll: mock.delivered,
    schedule: mock.schedule,
    cancel: mock.cancel,
    removeDeliveredNotificationsById: mock.remove,
    registerActionTypes: mock.actions,
  },
}));
import {
  notificationPlan,
  reminderTimes,
  syncNotifications,
  handleNotificationAction,
} from '../src/lib/notifications';
import { db, resetData } from '../src/lib/db';
import { preferences, type Task } from '../src/lib/models';
import { startTimer } from '../src/lib/actions';
const now = Date.parse('2026-11-09T08:00:00Z');
const task: Task = {
  id: 't',
  title: '作业',
  kind: 'assignment',
  notes: '',
  due: now + 86400000,
  priority: 'high',
  estimate: 25,
  done: false,
  subtasks: [],
  repeat: 'none',
};
const settings = {
  id: 'main' as const,
  theme: 'system' as const,
  sound: true,
  preferences: {
    ...preferences({}),
    taskNotifications: true,
    examNotifications: true,
    focusNotifications: true,
  },
};
beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(now);
  await resetData();
  mock.native.mockReturnValue(true);
  mock.permission.mockResolvedValue({ display: 'granted' });
  mock.exact.mockResolvedValue({ exact_alarm: 'denied' });
  mock.pending.mockResolvedValue({ notifications: [] });
  mock.delivered.mockResolvedValue({ notifications: [] });
  mock.schedule.mockResolvedValue({ notifications: [] });
  mock.cancel.mockResolvedValue(undefined);
  mock.remove.mockResolvedValue(undefined);
  mock.channels.mockResolvedValue(undefined);
  mock.actions.mockResolvedValue(undefined);
});
afterEach(() => vi.restoreAllMocks());
it('deduplicates multiple reminders, removes stale dates and preserves custom times', () => {
  expect(
    reminderTimes(
      now + 3600000,
      [
        { kind: 'before', value: 60 },
        { kind: 'before', value: 10 },
        { kind: 'before', value: 10 },
        { kind: 'at', value: now + 1000 },
      ],
      60,
      now,
    ),
  ).toEqual([now + 1000, now + 3000000]);
  expect(reminderTimes(now + 1000, [], 60, now)).toEqual([]);
});
it('maps tasks and exams to stable unique native IDs with correct routes', () => {
  const data = {
    tasks: [task],
    exams: [
      {
        id: 'e',
        name: '考试',
        kind: 'final' as const,
        at: now + 8 * 86400000,
        room: 'A203',
        notes: '',
        taskIds: [],
        archived: false,
        reminders: [
          { kind: 'before' as const, value: 10080 },
          { kind: 'before' as const, value: 4320 },
          { kind: 'before' as const, value: 1440 },
        ],
      },
    ],
    settings,
  };
  const plan = notificationPlan(data, now);
  expect(plan).toHaveLength(4);
  expect(new Set(plan.map((n) => n.id)).size).toBe(4);
  expect(notificationPlan(data, now).map((n) => n.id)).toEqual(plan.map((n) => n.id));
  expect(plan[0].extra.route).toBe('/tasks');
  expect(plan.at(-1)?.extra.route).toBe('/schedule/exams');
});
it('schedules native notifications, then cancels changed/completed tasks without duplicates', async () => {
  const data = { tasks: [task], exams: [], settings };
  await syncNotifications(data);
  expect(mock.schedule).toHaveBeenCalledOnce();
  const sent = mock.schedule.mock.calls[0][0].notifications;
  expect(sent[0].isExactNotification).toBe(false);
  mock.pending.mockResolvedValue({ notifications: sent });
  await syncNotifications(data);
  expect(mock.schedule).toHaveBeenCalledOnce();
  await syncNotifications({ ...data, tasks: [{ ...task, done: true }] });
  expect(mock.cancel).toHaveBeenCalledWith({ notifications: [{ id: sent[0].id }] });
});
it('permission denial is a real downgrade: does not schedule or prompt for exact alarms', async () => {
  mock.permission.mockResolvedValue({ display: 'denied' });
  await syncNotifications({ tasks: [task], exams: [], settings });
  expect(mock.schedule).not.toHaveBeenCalled();
  expect(mock.exact).not.toHaveBeenCalled();
});
it('turning categories off cancels all their pending reminders', async () => {
  const n = notificationPlan({ tasks: [task], exams: [], settings }, now);
  mock.pending.mockResolvedValue({ notifications: n });
  await syncNotifications({
    tasks: [task],
    exams: [],
    settings: { ...settings, preferences: { ...settings.preferences, taskNotifications: false } },
  });
  expect(mock.cancel).toHaveBeenCalledWith({ notifications: n.map((v) => ({ id: v.id })) });
  expect(mock.schedule).not.toHaveBeenCalled();
});
it('focus status has real actions and stale notification tokens never stop a new timer', async () => {
  await startTimer('custom', 60);
  const t = (await db.timer.get('active'))!;
  await syncNotifications({ tasks: [], exams: [], settings, timer: t });
  expect(mock.actions).toHaveBeenCalled();
  const status = mock.schedule.mock.calls.flatMap((c) => c[0].notifications).find((n) => n.ongoing);
  expect(status.actionTypeId).toBe('focus-running');
  await handleNotificationAction('finish', { route: '/focus', token: 'old-token' });
  expect((await db.timer.get('active'))?.token).toBe(t.token);
  await handleNotificationAction('pause', { route: '/focus', token: t.token });
  expect((await db.timer.get('active'))?.running).toBe(false);
  await handleNotificationAction('resume', { route: '/focus', token: t.token });
  expect((await db.timer.get('active'))?.running).toBe(true);
});
it('finite automatic group pre-schedules each phase; no break contributes a study record', async () => {
  await db.settings.put({
    ...settings,
    preferences: {
      ...settings.preferences,
      rounds: 2,
      shortMinutes: 1,
      longMinutes: 1,
      autoAdvance: true,
    },
  });
  await startTimer('pomodoro', 60, undefined, undefined, true);
  const timer = (await db.timer.get('active'))!;
  const plan = notificationPlan({ tasks: [], exams: [], settings, timer }, now);
  expect(plan).toHaveLength(4);
  expect(plan.map((n) => n.title)).toEqual(['专注完成', '休息结束', '专注完成', '休息结束']);
  expect(await db.sessions.count()).toBe(0);
});

it('completed tasks remove an already posted native reminder using stored triggered metadata', async () => {
  const posted = notificationPlan({ tasks: [task], exams: [], settings }, now);
  mock.delivered.mockResolvedValue({ notifications: posted });
  await syncNotifications({ tasks: [{ ...task, done: true }], exams: [], settings });
  expect(mock.remove).toHaveBeenCalledWith({ ids: [posted[0].id] });
});
