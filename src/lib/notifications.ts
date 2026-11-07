import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { DeviceTools } from './device-tools';
import { isNativeApp, NATIVE_RESUME_EVENT } from './native';
import {
  preferences,
  type Reminder,
  type Task,
  type Exam,
  type Settings,
  type Timer,
} from './models';
import { elapsedSeconds, pauseTimer, resumeTimer, finishTimer, advanceTimer } from './actions';
import { db } from './db';
import { fullDate } from './time';

const OWNER = 'StudyOS-v3';
const STATUS = 1200000001;
export interface ReminderData {
  tasks: Task[];
  exams: Exam[];
  settings: Settings;
  timer?: Timer;
}
export function reminderTimes(
  base: number,
  rules: Reminder[] | undefined,
  defaultLead: number,
  now: number,
) {
  return [
    ...new Set(
      (rules ?? [{ kind: 'before', value: defaultLead }]).map((r) =>
        r.kind === 'before' ? base - r.value * 60000 : r.value,
      ),
    ),
  ]
    .filter((t) => Number.isFinite(t) && t > now)
    .sort((a, b) => a - b)
    .slice(0, 8);
}
function hashId(key: string) {
  let n = 2166136261;
  for (const char of key) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return 1000 + ((n >>> 0) % 1000000000);
}
export function notificationPlan(data: ReminderData, now = Date.now()): LocalNotificationSchema[] {
  const p = preferences(data.settings),
    channel = `studyos-reminder-${data.settings.sound ? 1 : 0}-${p.vibrate ? 1 : 0}`;
  const result: LocalNotificationSchema[] = [];
  const add = (
    key: string,
    title: string,
    body: string,
    at: number,
    extra: Record<string, unknown>,
  ) => {
    result.push({
      id: hashId(key),
      title,
      body,
      schedule: { at: new Date(at), allowWhileIdle: true },
      channelId: channel,
      smallIcon: 'ic_stat_study',
      autoCancel: true,
      isExactNotification: false,
      extra: { owner: OWNER, at, ...extra, stamp: `${at}:${title}:${body}:${channel}` },
    });
  };
  if (p.taskNotifications)
    for (const t of data.tasks.filter((t) => !t.done))
      for (const at of reminderTimes(t.due, t.reminders, p.taskLead, now))
        add(`task:${t.id}:${at}`, t.title, `任务截止 ${fullDate(t.due)}`, at, {
          route: '/tasks',
          kind: 'task',
          entity: t.id,
          revision: JSON.stringify([t.title, t.due, t.reminders ?? null]),
        });
  if (p.examNotifications)
    for (const e of data.exams.filter((e) => !e.archived && e.at > now))
      for (const at of reminderTimes(e.at, e.reminders, p.examLead, now))
        add(
          `exam:${e.id}:${at}`,
          e.name,
          `考试 ${fullDate(e.at)}${e.room ? ` · ${e.room}` : ''}`,
          at,
          {
            route: '/schedule/exams',
            kind: 'exam',
            entity: e.id,
            revision: JSON.stringify([e.name, e.at, e.reminders ?? null]),
          },
        );
  const timer = data.timer;
  if (p.focusNotifications && timer?.running && timer.mode !== 'stopwatch') {
    let at = timer.anchor + Math.max(0, timer.goal - timer.elapsed) * 1000;
    if (at > now) {
      add(
        `focus:${timer.token}`,
        timer.mode === 'short' || timer.mode === 'long' ? '休息结束' : '专注完成',
        '点击返回专注',
        at,
        { route: '/focus', token: timer.token, kind: 'focus' },
      );
      // All remaining phases of this finite automatic group are scheduled natively.
      // WebView catch-up uses the exact same absolute phase boundaries.
      const cycle = timer.cycle;
      if (cycle?.auto) {
        let mode = timer.mode,
          round = cycle.round;
        for (let i = 0; i < 24 && mode !== 'long'; i++) {
          if (mode === 'pomodoro') mode = round >= cycle.rounds ? 'long' : 'short';
          else {
            mode = 'pomodoro';
            round++;
          }
          at +=
            (mode === 'pomodoro' ? cycle.focus : mode === 'short' ? cycle.short : cycle.long) *
            60000;
          add(
            `focus:${cycle.root}:${round}:${mode}`,
            mode === 'pomodoro' ? '专注完成' : '休息结束',
            '点击返回专注',
            at,
            { route: '/focus', token: timer.token, kind: 'focus' },
          );
        }
      }
    }
  }
  const used = new Set<number>();
  return result
    .sort((a, b) => a.schedule!.at!.getTime() - b.schedule!.at!.getTime())
    .slice(0, 64)
    .map((n) => {
      while (used.has(n.id)) n.id++;
      used.add(n.id);
      return n;
    });
}
let chain: Promise<unknown> = Promise.resolve();
let previousStatus = '';
export function syncNotifications(data: ReminderData) {
  const run = async () => {
    if (!isNativeApp()) return;
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;
    await DeviceTools.configureChannels();
    const exact =
      (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted';
    const desired = notificationPlan(data).map((n) => ({
      ...n,
      isExactNotification: exact,
      extra: { ...n.extra, stamp: `${n.extra.stamp}:${exact}` },
    }));
    // Android 8.3 getPending also contains stored, already-triggered entries.
    // Join this metadata to the actual shade API; shade entries have no `extra`.
    const { notifications: stored } = await LocalNotifications.getPending();
    const delivered = await LocalNotifications.getDeliveredNotifications();
    const prefs = preferences(data.settings),
      now = Date.now();
    const ours = stored.filter((n) => n.extra?.owner === OWNER && n.id !== STATUS);
    const invalid = (n: (typeof ours)[number]) => {
      if (n.extra?.kind === 'task') {
        const task = data.tasks.find((t) => t.id === n.extra.entity);
        return (
          !prefs.taskNotifications ||
          !task ||
          task.done ||
          n.extra.revision !== JSON.stringify([task.title, task.due, task.reminders ?? null])
        );
      }
      if (n.extra?.kind === 'exam') {
        const exam = data.exams.find((e) => e.id === n.extra.entity);
        return (
          !prefs.examNotifications ||
          !exam ||
          exam.archived ||
          n.extra.revision !== JSON.stringify([exam.name, exam.at, exam.reminders ?? null])
        );
      }
      return n.extra?.kind === 'focus' && !prefs.focusNotifications;
    };
    const expiredOrChanged = ours.filter((n) => invalid(n));
    const cancel = ours.filter(
      (n) =>
        invalid(n) ||
        (Number(n.extra.at) > now &&
          !desired.some((d) => d.id === n.id && d.extra.stamp === n.extra.stamp)),
    );
    if (cancel.length)
      await LocalNotifications.cancel({ notifications: cancel.map((n) => ({ id: n.id })) });
    if (expiredOrChanged.length)
      await LocalNotifications.removeDeliveredNotificationsById({
        ids: expiredOrChanged.map((n) => n.id),
      });
    const fresh = desired.filter(
      (n) => !ours.some((o) => o.id === n.id && o.extra.stamp === n.extra.stamp && !invalid(o)),
    );
    if (fresh.length) await LocalNotifications.schedule({ notifications: fresh });
    const t = data.timer;
    if (t && preferences(data.settings).focusNotifications) {
      const statusKey = `${t.token}:${t.running}:${t.anchor}:${t.elapsed}`;
      if (previousStatus !== statusKey || !delivered.notifications.some((n) => n.id === STATUS)) {
        await LocalNotifications.registerActionTypes({
          types: [
            {
              id: 'focus-running',
              actions: [
                { id: 'pause', title: '暂停并打开' },
                { id: 'finish', title: '保存并结束' },
              ],
            },
            {
              id: 'focus-paused',
              actions: [
                { id: 'resume', title: '继续并打开' },
                { id: 'finish', title: '保存并结束' },
              ],
            },
          ],
        });
        const rest = t.mode === 'short' || t.mode === 'long';
        const end = t.anchor + Math.max(0, t.goal - t.elapsed) * 1000;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: STATUS,
              title: `${rest ? '休息' : '专注'}${t.running ? '进行中' : '已暂停'}`,
              body:
                t.running && t.mode !== 'stopwatch'
                  ? `${fullDate(end)} 结束 · 点击查看实时计时`
                  : `${Math.floor(elapsedSeconds(t) / 60)} 分钟 · 点击返回专注`,
              channelId: 'studyos-status',
              smallIcon: 'ic_stat_study',
              ongoing: true,
              autoCancel: false,
              isExactNotification: false,
              actionTypeId: t.running ? 'focus-running' : 'focus-paused',
              extra: { owner: OWNER, route: '/focus', kind: 'status', token: t.token },
            },
          ],
        });
        if (t.running && t.mode !== 'stopwatch')
          await DeviceTools.setStatusExpiry({ id: STATUS, at: end });
        previousStatus = statusKey;
      }
    } else {
      await LocalNotifications.cancel({ notifications: [{ id: STATUS }] });
      await LocalNotifications.removeDeliveredNotificationsById({ ids: [STATUS] });
      previousStatus = '';
    }
  };
  chain = chain.catch(() => {}).then(run);
  return chain;
}
export async function notificationStatus(request = false) {
  if (!isNativeApp()) return { permission: 'unavailable', exact: false };
  const permission = request
    ? await LocalNotifications.requestPermissions()
    : await LocalNotifications.checkPermissions();
  const exact = await LocalNotifications.checkExactNotificationSetting();
  return { permission: permission.display, exact: exact.exact_alarm === 'granted' };
}
export async function handleNotificationAction(
  action: string,
  extra: { route?: string; token?: string; entity?: string; kind?: string },
) {
  if (extra.token) {
    const t = await db.timer.get('active');
    if (t?.token === extra.token) {
      if (t.running && t.mode !== 'stopwatch' && elapsedSeconds(t) >= t.goal) {
        if (t.cycle) await advanceTimer(t.token);
        else await finishTimer(true, '', t.token);
      } else if (action === 'pause') await pauseTimer();
      else if (action === 'resume') await resumeTimer();
      else if (action === 'finish') await finishTimer(true, '', t.token);
    }
  }
  const route =
    extra.route && ['/tasks', '/schedule/exams', '/focus'].includes(extra.route)
      ? extra.route
      : '/';
  location.hash = route;
  window.dispatchEvent(new Event(NATIVE_RESUME_EVENT));
}
export function listenNotifications(report: (message: string) => void) {
  if (!isNativeApp()) return () => {};
  const listener = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    void handleNotificationAction(event.actionId, event.notification.extra ?? {}).catch((e) =>
      report(String(e)),
    );
  });
  return () => {
    void listener.then((handle) => handle.remove());
  };
}
