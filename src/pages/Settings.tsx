import { useState } from 'react';
import {
  Sun,
  Moon,
  Laptop,
  ChevronRight,
  Plus,
  Trash2,
  Download,
  Upload,
  Database,
  ShieldCheck,
  BookOpen,
  Github,
  Bell,
  HardDrive,
} from 'lucide-react';
import { db, resetData } from '../lib/db';
import { useStore, useUI, go } from '../lib/context';
import { defaultPeriods, settingsSchema, type Settings as SettingsType } from '../lib/models';
import { localDate, monday, addDays } from '../lib/time';
import { exportBackup, importBackup, parseBackup, download } from '../lib/backup';
import { addDemo } from '../lib/demo';
import { Button, IconButton, Field, SaveForm, Modal } from '../components/ui';
import Habits from './Habits';
export default function Settings({ path }: { path: string }) {
  const d = useStore(),
    ui = useUI();
  const [backup, setBackup] = useState<{ raw: string; counts: string }>(),
    [mode, setMode] = useState<'merge' | 'replace'>('merge'),
    [reset, setReset] = useState(false),
    [resetText, setResetText] = useState(''),
    [busy, setBusy] = useState(false),
    [storage, setStorage] = useState('');
  const section = path.includes('semester')
    ? 'semester'
    : path.includes('habits')
      ? 'habits'
      : 'main';
  async function load(file?: File) {
    if (!file) return;
    try {
      if (file.size > 150000000) throw Error('备份不能超过 150 MB');
      const raw = await file.text();
      const parsed = parseBackup(raw);
      setBackup({
        raw,
        counts: `${parsed.data.courses.length} 门课程 · ${parsed.data.tasks.length} 项任务 · ${parsed.data.sessions.length} 条学习记录 · ${parsed.data.materials.length} 份资料`,
      });
    } catch (e) {
      ui.notify(e instanceof Error ? e.message : '无法读取文件');
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          {section !== 'main' && (
            <button className="text-button" onClick={() => go('/me')}>
              返回我的
            </button>
          )}
          <h1>
            {section === 'semester' ? '学期设置' : section === 'habits' ? '我的习惯' : '我的'}
          </h1>
        </div>
      </div>
      {section === 'semester' ? (
        <Semester />
      ) : section === 'habits' ? (
        <Habits />
      ) : (
        <div className="settings-layout">
          <div>
            <section className="panel">
              <h2>外观</h2>
              <div className="theme-picker">
                {(
                  [
                    { value: 'light', label: '浅色', Icon: Sun },
                    { value: 'dark', label: '深色', Icon: Moon },
                    { value: 'system', label: '跟随系统', Icon: Laptop },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    aria-pressed={d.settings.theme === value}
                    onClick={() => db.settings.put({ ...d.settings, theme: value })}
                  >
                    <div className={`theme-preview theme-${value}`}>
                      <span />
                      <span />
                      <span />
                    </div>
                    <span>
                      <Icon size={16} />
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel settings-links">
              <button onClick={() => go('/me/semester')}>
                <BookOpen size={20} />
                <span>学期与节次</span>
                <span className="muted">{d.settings.semester?.name ?? '未设置'}</span>
                <ChevronRight size={18} />
              </button>
              <button onClick={() => go('/me/habits')}>
                <ShieldCheck size={20} />
                <span>我的习惯</span>
                <ChevronRight size={18} />
              </button>
              <label>
                <Bell size={20} />
                <span>专注声音提醒</span>
                <input
                  type="checkbox"
                  checked={d.settings.sound}
                  onChange={(e) => db.settings.put({ ...d.settings, sound: e.target.checked })}
                />
              </label>
              <p className="settings-note">后台休眠时声音可能延迟，返回应用后会按实际时间校准。</p>
            </section>
            <section className="panel">
              <h2>数据与备份</h2>
              <p className="settings-note">
                数据保存在此浏览器。备份包含上传的课程资料；清理浏览器数据前请导出。
              </p>
              <div className="backup-actions">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      download(
                        new Blob([await exportBackup()], { type: 'application/json' }),
                        `StudyOS-${localDate()}.json`,
                      );
                      ui.notify('备份已导出');
                    } catch (e) {
                      ui.notify(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Download size={17} />
                  导出备份
                </Button>
                <label className="button secondary file-button">
                  <Upload size={17} />
                  导入备份
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => {
                      void load(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <div className="storage-row">
                <HardDrive size={18} />
                <span>{storage || '防止浏览器自动清理数据'}</span>
                <button
                  className="text-button"
                  onClick={async () => {
                    if (!navigator.storage?.persist) {
                      setStorage('此浏览器不支持持久存储申请');
                      return;
                    }
                    const persisted = await navigator.storage.persist();
                    const estimate = await navigator.storage.estimate();
                    setStorage(
                      `${persisted ? '已获得持久存储' : '浏览器未授予持久存储'} · 已用 ${((estimate.usage ?? 0) / 1024 / 1024).toFixed(1)} MB`,
                    );
                  }}
                >
                  检查存储
                </button>
              </div>
              <button
                className="text-button danger-text"
                onClick={async () => {
                  if (await ui.confirm('清空所有学习数据？', '此操作无法撤销，请先导出备份。'))
                    setReset(true);
                }}
              >
                清空所有数据
              </button>
            </section>
          </div>
          <aside>
            <section className="panel about-card">
              <div className="about-logo">
                <BookOpen size={28} />
              </div>
              <h2>学序</h2>
              <p>StudyOS · 1.0.0</p>
              <span className="privacy-tag">
                <Database size={15} />
                本地存储 · 无需登录
              </span>
              <a
                href="https://github.com/J-Ruan/StudyOS"
                target="_blank"
                rel="noreferrer"
                className="button secondary"
              >
                <Github size={17} />
                项目源码
              </a>
              <p className="settings-note">
                可通过浏览器菜单安装到桌面。离线功能在首次联网加载后可用。
              </p>
              <Button
                variant="ghost"
                onClick={async () => {
                  if (
                    await ui.confirm(
                      '添加虚拟示例数据？',
                      '仅在没有课程、任务、考试和学习记录时可用。',
                    )
                  ) {
                    try {
                      await addDemo();
                      ui.notify('示例已添加');
                    } catch (e) {
                      ui.notify(String(e));
                    }
                  }
                }}
              >
                体验示例数据
              </Button>
            </section>
          </aside>
        </div>
      )}
      {backup && (
        <Modal title="恢复备份" onClose={() => setBackup(undefined)}>
          <p>{backup.counts}</p>
          <Field label="恢复方式">
            <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="merge">合并，相同编号保留本机数据</option>
              <option value="replace">覆盖，替换本机全部数据</option>
            </select>
          </Field>
          <p className="settings-note">合并导入可重复执行，不会重复累计学习时长。</p>
          <div className="form-footer">
            <Button variant="secondary" onClick={() => setBackup(undefined)}>
              取消
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                if (
                  mode === 'replace' &&
                  !(await ui.confirm('覆盖本机全部数据？', '请确认已保留本机备份。'))
                )
                  return;
                setBusy(true);
                try {
                  await importBackup(backup.raw, mode);
                  setBackup(undefined);
                  ui.notify('备份已恢复');
                } catch (e) {
                  ui.notify(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认恢复
            </Button>
          </div>
        </Modal>
      )}
      {reset && (
        <Modal title="确认清空" onClose={() => setReset(false)}>
          <SaveForm
            onSave={async () => {
              if (resetText !== '删除') throw Error('请输入“删除”确认');
              await resetData();
              setReset(false);
              setResetText('');
              ui.notify('所有数据已清空');
            }}
          >
            <Field label="输入“删除”以继续">
              <input required value={resetText} onChange={(e) => setResetText(e.target.value)} />
            </Field>
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
function Semester() {
  const d = useStore(),
    ui = useUI();
  const [semester, set] = useState<NonNullable<SettingsType['semester']>>(
    d.settings.semester ?? {
      name: '新学期',
      start: monday(),
      end: addDays(monday(), 111),
      weeks: 16,
      periods: defaultPeriods,
    },
  );
  const patch = (p: Partial<typeof semester>) => set({ ...semester, ...p });
  return (
    <section className="panel semester-panel">
      <SaveForm
        onSave={async () => {
          const valid = settingsSchema.parse({ ...d.settings, semester });
          if (
            d.courses.some((c) =>
              c.slots.some((s) => s.end > semester.periods.length || s.to > semester.weeks),
            )
          )
            throw Error('现有课程超出新的节次或周数，请先调整课程');
          await db.settings.put(valid);
          ui.notify('学期设置已保存');
        }}
      >
        <div className="form-grid">
          <Field label="学期名称" wide>
            <input
              required
              maxLength={200}
              value={semester.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="开始日期">
            <input
              required
              type="date"
              value={semester.start}
              onChange={(e) => patch({ start: e.target.value })}
            />
          </Field>
          <Field label="结束日期">
            <input
              required
              type="date"
              min={semester.start}
              value={semester.end}
              onChange={(e) => patch({ end: e.target.value })}
            />
          </Field>
          <Field label="教学周数">
            <input
              required
              type="number"
              min="1"
              max="60"
              value={semester.weeks}
              onChange={(e) => patch({ weeks: +e.target.value })}
            />
          </Field>
        </div>
        <div className="section-title">
          <h2>每日节次</h2>
          <Button
            type="button"
            variant="ghost"
            disabled={semester.periods.length >= 20}
            onClick={() =>
              patch({ periods: [...semester.periods, { start: '22:35', end: '23:20' }] })
            }
          >
            <Plus size={16} />
            增加节次
          </Button>
        </div>
        <div className="period-editors">
          {semester.periods.map((p, i) => (
            <div key={i}>
              <strong>第 {i + 1} 节</strong>
              <input
                aria-label={`第${i + 1}节开始`}
                type="time"
                required
                value={p.start}
                onChange={(e) =>
                  patch({
                    periods: semester.periods.map((v, n) =>
                      n === i ? { ...v, start: e.target.value } : v,
                    ),
                  })
                }
              />
              <span>—</span>
              <input
                aria-label={`第${i + 1}节结束`}
                type="time"
                required
                value={p.end}
                onChange={(e) =>
                  patch({
                    periods: semester.periods.map((v, n) =>
                      n === i ? { ...v, end: e.target.value } : v,
                    ),
                  })
                }
              />
              {i === semester.periods.length - 1 && i > 0 ? (
                <IconButton
                  type="button"
                  label="删除末节"
                  onClick={() => patch({ periods: semester.periods.slice(0, -1) })}
                >
                  <Trash2 size={16} />
                </IconButton>
              ) : (
                <span className="icon-placeholder" />
              )}
            </div>
          ))}
        </div>
      </SaveForm>
    </section>
  );
}
