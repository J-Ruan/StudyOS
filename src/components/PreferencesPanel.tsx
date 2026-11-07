import { useEffect, useState } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { preferences, preferencesSchema, type Preferences } from '../lib/models';
import { db } from '../lib/db';
import { useStore, useUI } from '../lib/context';
import { notificationStatus } from '../lib/notifications';
import { isNativeApp, NATIVE_RESUME_EVENT } from '../lib/native';
import { SaveForm, Field, Button } from './ui';
export default function PreferencesPanel() {
  const d = useStore(),
    ui = useUI();
  const [draft, setDraft] = useState(() => preferences(d.settings)),
    [status, setStatus] = useState<{ permission: string; exact: boolean }>({
      permission: 'unknown',
      exact: false,
    });
  const patch = (p: Partial<Preferences>) => setDraft({ ...draft, ...p });
  useEffect(() => {
    const refresh = () => {
      void notificationStatus()
        .then(setStatus)
        .catch((e) => ui.notify(String(e)));
    };
    refresh();
    window.addEventListener(NATIVE_RESUME_EVENT, refresh);
    return () => window.removeEventListener(NATIVE_RESUME_EVENT, refresh);
  }, [ui]);
  return (
    <section className="panel preferences-panel">
      <h2>使用偏好</h2>
      <SaveForm
        onSave={async () => {
          const valid = preferencesSchema.parse(draft);
          if (valid.studyEnd <= valid.studyStart) throw Error('学习结束时间须晚于开始时间');
          await db.transaction('rw', db.settings, async () => {
            const latest = (await db.settings.get('main')) ?? d.settings;
            await db.settings.put({ ...latest, preferences: valid });
          });
          ui.notify('偏好已保存');
        }}
      >
        <div className="form-grid">
          <Field label="启动页面">
            <select
              value={draft.startPage}
              onChange={(e) => patch({ startPage: e.target.value as Preferences['startPage'] })}
            >
              <option value="/">今天</option>
              <option value="/schedule">课程</option>
              <option value="/tasks">任务</option>
              <option value="/focus">专注</option>
            </select>
          </Field>
          <Field label="强调色">
            <select
              value={draft.accent}
              onChange={(e) => patch({ accent: e.target.value as Preferences['accent'] })}
            >
              <option value="purple">鸢尾紫</option>
              <option value="rose">玫瑰粉</option>
              <option value="teal">松石绿</option>
              <option value="blue">雾蓝</option>
            </select>
          </Field>
        </div>
        <details className="preference-section">
          <summary>专注与休息</summary>
          <div className="form-grid">
            {(
              [
                ['focusMinutes', '专注时长（分钟）', 180],
                ['shortMinutes', '短休息（分钟）', 60],
                ['longMinutes', '长休息（分钟）', 120],
                ['rounds', '每组专注轮数', 12],
              ] as const
            ).map(([key, label, max]) => (
              <Field label={label} key={key}>
                <input
                  type="number"
                  required
                  min="1"
                  max={max}
                  value={draft[key]}
                  onChange={(e) => patch({ [key]: +e.target.value })}
                />
              </Field>
            ))}
          </div>
          <label className="switch-row">
            <span>自动进入下一阶段</span>
            <input
              type="checkbox"
              checked={draft.autoAdvance}
              onChange={(e) => patch({ autoAdvance: e.target.checked })}
            />
          </label>
          <label className="switch-row">
            <span>提醒振动</span>
            <input
              type="checkbox"
              checked={draft.vibrate}
              onChange={(e) => patch({ vibrate: e.target.checked })}
            />
          </label>
          <p className="settings-note">
            每组完成长休息后停止。关闭自动进入时，下一阶段等待你点击继续。
          </p>
        </details>
        <details className="preference-section">
          <summary>学习时间范围</summary>
          <div className="form-grid">
            <Field label="默认最早开始">
              <input
                type="time"
                required
                value={draft.studyStart}
                onChange={(e) => patch({ studyStart: e.target.value })}
              />
            </Field>
            <Field label="默认最晚结束">
              <input
                type="time"
                required
                value={draft.studyEnd}
                onChange={(e) => patch({ studyEnd: e.target.value })}
              />
            </Field>
          </div>
        </details>
        <details className="preference-section">
          <summary>通知与提醒</summary>
          {(
            [
              ['taskNotifications', '任务提醒'],
              ['examNotifications', '考试提醒'],
              ['focusNotifications', '专注提醒与状态'],
            ] as const
          ).map(([key, label]) => (
            <label className="switch-row" key={key}>
              <span>{label}</span>
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => patch({ [key]: e.target.checked })}
              />
            </label>
          ))}
          <div className="form-grid">
            <Field label="任务默认提前（分钟）">
              <input
                type="number"
                min="0"
                max="525600"
                required
                value={draft.taskLead}
                onChange={(e) => patch({ taskLead: +e.target.value })}
              />
            </Field>
            <Field label="考试默认提前（分钟）">
              <input
                type="number"
                min="0"
                max="525600"
                required
                value={draft.examLead}
                onChange={(e) => patch({ examLead: +e.target.value })}
              />
            </Field>
          </div>
          {isNativeApp() ? (
            <>
              <p className="notice" role="status">
                {status.permission === 'granted'
                  ? `通知已允许 · ${status.exact ? '精确提醒已允许' : '普通提醒可能延迟'}`
                  : status.permission === 'denied'
                    ? '通知权限被拒绝，请在系统设置中允许。应用内到期状态仍会显示。'
                    : '开启系统通知后，提醒可在应用退到后台时显示。'}
              </p>
              <div className="inline-actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setStatus(await notificationStatus(true));
                    } catch (e) {
                      ui.notify(String(e));
                    }
                  }}
                >
                  允许系统通知
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await LocalNotifications.changeExactNotificationSetting();
                      setStatus(await notificationStatus());
                    } catch (e) {
                      ui.notify(String(e));
                    }
                  }}
                >
                  精确提醒设置
                </Button>
              </div>
            </>
          ) : (
            <p className="settings-note">
              系统提醒仅在 Android APK 中使用；Web 保留应用内计时与到期状态。
            </p>
          )}
        </details>
      </SaveForm>
    </section>
  );
}
