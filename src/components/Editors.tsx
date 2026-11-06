import { useState } from 'react';
import { Plus, Trash2, FileText, ExternalLink, Upload, Play } from 'lucide-react';
import { db } from '../lib/db';
import { useStore, useUI, type Editor } from '../lib/context';
import {
  id,
  courseSchema,
  taskSchema,
  examSchema,
  habitSchema,
  sessionSchema,
  overrideSchema,
  weekdays,
  kindNames,
  type Course,
  type Task,
  type Exam,
  type Habit,
  type Session,
  type Override,
} from '../lib/models';
import { deleteCourse, deleteTask, safeURL } from '../lib/actions';
import { atTime, dateTimeInput, fromInput, localDate, duration } from '../lib/time';
import { download } from '../lib/backup';
import { Modal, Button, IconButton, SaveForm, Field } from './ui';
const colors = ['#ad83c4', '#b47e9b', '#7e9b93', '#8499b6', '#b39873', '#8c88b6'];
function CourseSelect({
  value,
  onChange,
  id,
}: {
  value?: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  const { courses } = useStore();
  return (
    <select
      id={id}
      aria-label="关联课程"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">不关联课程</option>
      {courses.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
export function Editors({ editor }: { editor: Editor }) {
  switch (editor.kind) {
    case 'course':
      return <CourseEditor editor={editor} />;
    case 'task':
      return <TaskEditor editor={editor} />;
    case 'exam':
      return <ExamEditor editor={editor} />;
    case 'habit':
      return <HabitEditor editor={editor} />;
    case 'session':
      return <SessionEditor editor={editor} />;
    case 'override':
      return <OverrideEditor editor={editor} />;
  }
}
function CourseEditor({ editor }: { editor: Editor }) {
  const data = useStore(),
    ui = useUI();
  const exists = data.courses.find((c) => c.id === editor.id);
  const [c, set] = useState<Course>(
    exists ?? {
      id: id(),
      name: '',
      teacher: '',
      room: '',
      color: colors[0],
      slots: [
        {
          id: id(),
          day: 1,
          start: 1,
          end: 2,
          from: 1,
          to: data.settings.semester?.weeks ?? 16,
          parity: 'all',
        },
      ],
    },
  );
  const [url, setUrl] = useState(''),
    [resourceName, setResourceName] = useState('');
  const patch = (p: Partial<Course>) => set({ ...c, ...p });
  async function remove() {
    if (await ui.confirm('删除这门课程？', '课程时段和资料将删除，任务与学习记录会保留。')) {
      await deleteCourse(c.id);
      ui.close();
      ui.notify('课程已删除');
    }
  }
  async function files(list: FileList | null) {
    if (!list) return;
    try {
      for (const file of Array.from(list)) {
        if (file.size > 20 * 1024 * 1024) throw Error('单个文件不能超过 20 MB');
        await db.materials.add({ id: id(), courseId: c.id, name: file.name, data: file });
      }
      ui.notify('资料已保存到本机');
    } catch (e) {
      ui.notify(String(e));
    }
  }
  return (
    <Modal title={exists ? '课程详情' : '新建课程'} onClose={ui.close} wide>
      <SaveForm
        onSave={async () => {
          const valid = courseSchema.parse(c);
          const semester = data.settings.semester;
          if (
            semester &&
            valid.slots.some((s) => s.end > semester.periods.length || s.to > semester.weeks)
          )
            throw Error('课程节次或教学周超出学期设置');
          await db.courses.put(valid);
          ui.close();
          ui.notify('课程已保存');
        }}
        footer={
          exists ? (
            <Button type="button" variant="danger" onClick={() => void remove()}>
              <Trash2 size={16} />
              删除
            </Button>
          ) : null
        }
      >
        <div className="form-grid">
          <Field label="课程名称" wide>
            <input
              required
              maxLength={200}
              value={c.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="教师">
            <input value={c.teacher} onChange={(e) => patch({ teacher: e.target.value })} />
          </Field>
          <Field label="教室">
            <input value={c.room} onChange={(e) => patch({ room: e.target.value })} />
          </Field>
          <div className="field wide">
            <span>课程颜色</span>
            <div className="color-options">
              {colors.map((color) => (
                <button
                  type="button"
                  key={color}
                  aria-label={`颜色 ${color}`}
                  aria-pressed={c.color === color}
                  style={{ background: color }}
                  onClick={() => patch({ color })}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="section-title">
          <h3>上课时段</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              patch({
                slots: [
                  ...c.slots,
                  {
                    id: id(),
                    day: 1,
                    start: 1,
                    end: 2,
                    from: 1,
                    to: data.settings.semester?.weeks ?? 16,
                    parity: 'all',
                  },
                ],
              })
            }
          >
            <Plus size={16} />
            添加时段
          </Button>
        </div>
        {c.slots.map((slot, index) => {
          const update = (p: Partial<typeof slot>) =>
            patch({ slots: c.slots.map((s, i) => (i === index ? { ...s, ...p } : s)) });
          return (
            <div className="slot-editor" key={slot.id}>
              <div className="form-grid three">
                <Field label="星期">
                  <select value={slot.day} onChange={(e) => update({ day: +e.target.value })}>
                    {weekdays.map((w, i) => (
                      <option key={w} value={i + 1}>
                        周{w}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="开始节次">
                  <input
                    required
                    type="number"
                    min="1"
                    max={data.settings.semester?.periods.length ?? 20}
                    value={slot.start}
                    onChange={(e) => update({ start: +e.target.value })}
                  />
                </Field>
                <Field label="结束节次">
                  <input
                    required
                    type="number"
                    min={slot.start}
                    max={data.settings.semester?.periods.length ?? 20}
                    value={slot.end}
                    onChange={(e) => update({ end: +e.target.value })}
                  />
                </Field>
                <Field label="开始周">
                  <input
                    required
                    type="number"
                    min="1"
                    max="60"
                    value={slot.from}
                    onChange={(e) => update({ from: +e.target.value })}
                  />
                </Field>
                <Field label="结束周">
                  <input
                    required
                    type="number"
                    min={slot.from}
                    max="60"
                    value={slot.to}
                    onChange={(e) => update({ to: +e.target.value })}
                  />
                </Field>
                <Field label="重复">
                  <select
                    value={slot.parity}
                    onChange={(e) => update({ parity: e.target.value as typeof slot.parity })}
                  >
                    <option value="all">每周</option>
                    <option value="odd">单周</option>
                    <option value="even">双周</option>
                  </select>
                </Field>
              </div>
              {c.slots.length > 1 && (
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => patch({ slots: c.slots.filter((s) => s.id !== slot.id) })}
                >
                  移除此时段
                </button>
              )}
            </div>
          );
        })}
      </SaveForm>
      {exists && (
        <div className="course-related">
          {editor.occurrence && (
            <Button
              variant="secondary"
              onClick={() =>
                ui.open(
                  editor.occurrence?.adjusted
                    ? { kind: 'override', id: editor.occurrence.key }
                    : { kind: 'override', courseId: c.id, occurrence: editor.occurrence },
                )
              }
            >
              调整这次课程
            </Button>
          )}
          <div className="inline-actions">
            <Button variant="ghost" onClick={() => ui.open({ kind: 'task', courseId: c.id })}>
              <Plus size={16} />
              关联作业
            </Button>
            <Button variant="ghost" onClick={() => ui.open({ kind: 'exam', courseId: c.id })}>
              <Plus size={16} />
              关联考试
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                ui.close();
                ui.focus(c.id);
              }}
            >
              <Play size={16} />
              开始专注
            </Button>
          </div>
          <p className="muted">
            {data.tasks.filter((t) => t.courseId === c.id && !t.done).length} 项待办 ·{' '}
            {data.exams.filter((e) => e.courseId === c.id).length} 场考试 ·{' '}
            {duration(
              data.sessions.filter((s) => s.courseId === c.id).reduce((n, s) => n + s.seconds, 0),
            )}{' '}
            专注
          </p>
          <h3>课程资料</h3>
          <div className="resource-list">
            {data.materials
              .filter((m) => m.courseId === c.id)
              .map((m) => (
                <div key={m.id}>
                  <FileText size={18} />
                  {m.data ? (
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await download(m.data!, m.name);
                        } catch (error) {
                          ui.notify(
                            error instanceof Error ? error.message : '无法打开资料，请重试',
                          );
                        }
                      }}
                    >
                      {m.name}
                    </button>
                  ) : (
                    <a href={safeURL(m.url ?? '')} target="_blank" rel="noreferrer">
                      {m.name}
                      <ExternalLink size={13} />
                    </a>
                  )}
                  <IconButton
                    label={`删除资料 ${m.name}`}
                    onClick={async () => {
                      if (await ui.confirm('删除这份资料？')) await db.materials.delete(m.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              ))}
          </div>
          <div className="form-grid">
            <Field label="资料名称">
              <input value={resourceName} onChange={(e) => setResourceName(e.target.value)} />
            </Field>
            <Field label="链接">
              <input
                placeholder="https:// 或 obsidian://"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
          </div>
          <div className="inline-actions">
            <Button
              variant="secondary"
              onClick={async () => {
                const valid = safeURL(url);
                if (!valid || !resourceName.trim()) {
                  ui.notify('请填写资料名称与有效链接');
                  return;
                }
                await db.materials.add({
                  id: id(),
                  courseId: c.id,
                  name: resourceName.trim(),
                  url: valid,
                });
                setUrl('');
                setResourceName('');
              }}
            >
              添加链接
            </Button>
            <label className="button secondary file-button">
              <Upload size={16} />
              上传文件
              <input
                type="file"
                multiple
                accept=".pdf,.ppt,.pptx,.doc,.docx,image/*,.md,.txt"
                onChange={(e) => {
                  void files(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      )}
    </Modal>
  );
}
function TaskEditor({ editor }: { editor: Editor }) {
  const data = useStore(),
    ui = useUI();
  const exists = data.tasks.find((t) => t.id === editor.id);
  const [t, set] = useState<Task>(
    exists ?? {
      id: id(),
      title: '',
      kind: 'assignment',
      courseId: editor.courseId,
      notes: '',
      due: atTime(localDate(), '23:59'),
      priority: 'medium',
      estimate: 25,
      done: false,
      subtasks: [],
      repeat: 'none',
    },
  );
  const patch = (p: Partial<Task>) => set({ ...t, ...p });
  const [sub, setSub] = useState('');
  async function remove() {
    if (await ui.confirm('删除这个任务？', '已记录的专注时间会保留。')) {
      await deleteTask(t.id);
      ui.close();
      ui.notify('任务已删除');
    }
  }
  return (
    <Modal title={exists ? '任务详情' : '新建任务'} onClose={ui.close}>
      <SaveForm
        onSave={async () => {
          await db.tasks.put(taskSchema.parse(t));
          ui.close();
          ui.notify('任务已保存');
        }}
        footer={
          exists ? (
            <Button type="button" variant="danger" onClick={() => void remove()}>
              <Trash2 size={16} />
              删除
            </Button>
          ) : null
        }
      >
        <div className="form-grid">
          <Field label="任务标题" wide>
            <input
              required
              maxLength={200}
              value={t.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </Field>
          <Field label="任务类型">
            <select
              value={t.kind}
              onChange={(e) => patch({ kind: e.target.value as Task['kind'] })}
            >
              {Object.entries(kindNames).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="关联课程">
            <CourseSelect
              value={t.courseId}
              onChange={(courseId) => patch({ courseId: courseId || undefined })}
            />
          </Field>
          <Field label="截止时间">
            <input
              type="datetime-local"
              required
              value={dateTimeInput(t.due)}
              onChange={(e) => patch({ due: fromInput(e.target.value) })}
            />
          </Field>
          <Field label="优先级">
            <select
              value={t.priority}
              onChange={(e) => patch({ priority: e.target.value as Task['priority'] })}
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </Field>
          <Field label="预计耗时（分钟）">
            <input
              required
              type="number"
              min="1"
              max="1440"
              value={t.estimate}
              onChange={(e) => patch({ estimate: +e.target.value })}
            />
          </Field>
          <Field label="重复规则">
            <select
              value={t.repeat}
              onChange={(e) => patch({ repeat: e.target.value as Task['repeat'] })}
            >
              <option value="none">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </Field>
          <Field label="备注" wide>
            <textarea value={t.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
        </div>
        <h3>子任务</h3>
        {t.subtasks.map((s) => (
          <div className="subtask" key={s.id}>
            <input
              type="checkbox"
              aria-label={s.title}
              checked={s.done}
              onChange={(e) =>
                patch({
                  subtasks: t.subtasks.map((v) =>
                    v.id === s.id ? { ...v, done: e.target.checked } : v,
                  ),
                })
              }
            />
            <span>{s.title}</span>
            <IconButton
              type="button"
              label={`删除子任务 ${s.title}`}
              onClick={() => patch({ subtasks: t.subtasks.filter((v) => v.id !== s.id) })}
            >
              <Trash2 size={15} />
            </IconButton>
          </div>
        ))}
        <div className="input-action">
          <input
            aria-label="子任务名称"
            placeholder="添加子任务"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
          />
          <IconButton
            type="button"
            label="添加子任务"
            onClick={() => {
              if (sub.trim()) {
                patch({ subtasks: [...t.subtasks, { id: id(), title: sub.trim(), done: false }] });
                setSub('');
              }
            }}
          >
            <Plus size={18} />
          </IconButton>
        </div>
        {t.scheduledStart && (
          <p className="muted">
            自习安排：{dateTimeInput(t.scheduledStart).replace('T', ' ')}
            <button
              type="button"
              className="text-button"
              onClick={() => patch({ scheduledStart: undefined, scheduledEnd: undefined })}
            >
              取消安排
            </button>
          </p>
        )}
      </SaveForm>
      {exists && (
        <div className="detail-footer">
          <span className="muted">
            累计专注{' '}
            {duration(
              data.sessions.filter((s) => s.taskId === t.id).reduce((n, s) => n + s.seconds, 0),
            )}
          </span>
          <Button
            variant="secondary"
            onClick={() => {
              ui.close();
              ui.focus(t.courseId, t.id);
            }}
          >
            <Play size={16} />
            开始专注
          </Button>
        </div>
      )}
    </Modal>
  );
}
function ExamEditor({ editor }: { editor: Editor }) {
  const data = useStore(),
    ui = useUI();
  const exists = data.exams.find((e) => e.id === editor.id);
  const [e, set] = useState<Exam>(
    exists ?? {
      id: id(),
      name: '',
      kind: 'final',
      at: atTime(localDate(), '09:00'),
      room: '',
      courseId: editor.courseId,
      notes: '',
      taskIds: [],
      archived: false,
    },
  );
  const patch = (p: Partial<Exam>) => set({ ...e, ...p });
  return (
    <Modal title={exists ? '考试详情' : '新建考试'} onClose={ui.close}>
      <SaveForm
        onSave={async () => {
          await db.exams.put(examSchema.parse(e));
          ui.close();
          ui.notify('考试已保存');
        }}
        footer={
          exists ? (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (await ui.confirm('删除这场考试？')) {
                  await db.exams.delete(e.id);
                  ui.close();
                }
              }}
            >
              删除
            </Button>
          ) : null
        }
      >
        <div className="form-grid">
          <Field label="考试名称" wide>
            <input
              required
              maxLength={200}
              value={e.name}
              onChange={(v) => patch({ name: v.target.value })}
            />
          </Field>
          <Field label="类型">
            <select
              value={e.kind}
              onChange={(v) => patch({ kind: v.target.value as Exam['kind'] })}
            >
              <option value="final">期末考试</option>
              <option value="english">英语四级 / 六级</option>
              <option value="computer">计算机等级</option>
              <option value="custom">自定义考试</option>
            </select>
          </Field>
          <Field label="考试时间">
            <input
              required
              type="datetime-local"
              value={dateTimeInput(e.at)}
              onChange={(v) => patch({ at: fromInput(v.target.value) })}
            />
          </Field>
          <Field label="地点">
            <input value={e.room} onChange={(v) => patch({ room: v.target.value })} />
          </Field>
          <Field label="关联课程">
            <CourseSelect
              value={e.courseId}
              onChange={(courseId) => patch({ courseId: courseId || undefined })}
            />
          </Field>
          <Field label="备注" wide>
            <textarea value={e.notes} onChange={(v) => patch({ notes: v.target.value })} />
          </Field>
        </div>
        <h3>关联复习任务</h3>
        {data.tasks
          .filter((t) => t.kind === 'review' || t.courseId === e.courseId)
          .map((t) => (
            <label className="subtask" key={t.id}>
              <input
                type="checkbox"
                checked={e.taskIds.includes(t.id)}
                onChange={(v) =>
                  patch({
                    taskIds: v.target.checked
                      ? [...e.taskIds, t.id]
                      : e.taskIds.filter((id) => id !== t.id),
                  })
                }
              />
              {t.title}
            </label>
          ))}
        <label className="switch-row">
          <span>归档考试</span>
          <input
            type="checkbox"
            checked={e.archived}
            onChange={(v) => patch({ archived: v.target.checked })}
          />
        </label>
      </SaveForm>
    </Modal>
  );
}
function HabitEditor({ editor }: { editor: Editor }) {
  const data = useStore(),
    ui = useUI();
  const exists = data.habits.find((h) => h.id === editor.id);
  const [h, set] = useState<Habit>(
    exists ?? {
      id: id(),
      name: '',
      kind: 'check',
      target: 1,
      days: [1, 2, 3, 4, 5, 6, 7],
      created: localDate(),
    },
  );
  const patch = (p: Partial<Habit>) => set({ ...h, ...p });
  return (
    <Modal title={exists ? '编辑习惯' : '新建习惯'} onClose={ui.close}>
      <SaveForm
        onSave={async () => {
          await db.habits.put(habitSchema.parse(h));
          ui.close();
          ui.notify('习惯已保存');
        }}
        footer={
          exists ? (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (await ui.confirm('删除这个习惯？', '它的打卡记录也会删除。')) {
                  await db.transaction('rw', [db.habits, db.checks], async () => {
                    await db.habits.delete(h.id);
                    await db.checks.where('habitId').equals(h.id).delete();
                  });
                  ui.close();
                }
              }}
            >
              删除
            </Button>
          ) : null
        }
      >
        <div className="form-grid">
          <Field label="习惯名称" wide>
            <input
              required
              maxLength={200}
              value={h.name}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>
          <Field label="类型">
            <select
              value={h.kind}
              onChange={(e) => patch({ kind: e.target.value as Habit['kind'], target: 1 })}
            >
              <option value="check">完成型</option>
              <option value="count">次数型</option>
              <option value="minutes">时长型</option>
            </select>
          </Field>
          <Field label={h.kind === 'minutes' ? '每日目标（分钟）' : '每日目标（次）'}>
            <input
              type="number"
              required
              min="1"
              max={h.kind === 'check' ? 1 : 10000}
              disabled={h.kind === 'check'}
              value={h.target}
              onChange={(e) => patch({ target: +e.target.value })}
            />
          </Field>
        </div>
        <h3>执行星期</h3>
        <div className="day-picker">
          {weekdays.map((w, i) => (
            <button
              type="button"
              key={w}
              aria-pressed={h.days.includes(i + 1)}
              onClick={() =>
                patch({
                  days: h.days.includes(i + 1)
                    ? h.days.filter((d) => d !== i + 1)
                    : [...h.days, i + 1],
                })
              }
            >
              {w}
            </button>
          ))}
        </div>
      </SaveForm>
    </Modal>
  );
}
function SessionEditor({ editor }: { editor: Editor }) {
  const data = useStore(),
    ui = useUI(),
    exists = data.sessions.find((s) => s.id === editor.id)!;
  const [s, set] = useState<Session>(exists);
  const [minutes, setMinutes] = useState(String(Math.round((exists.seconds / 60) * 100) / 100));
  const [timesEdited, setTimesEdited] = useState(false);
  const patch = (p: Partial<Session>) => set({ ...s, ...p });
  return (
    <Modal title="学习记录" onClose={ui.close}>
      <SaveForm
        onSave={async () => {
          const seconds = Number(minutes) * 60;
          const end = s.start + seconds * 1000;
          if (end > Date.now() + 1000) throw Error('学习记录不能位于未来');
          await db.sessions.put(
            sessionSchema.parse(
              timesEdited ? { ...s, seconds, end, segments: [{ start: s.start, end }] } : s,
            ),
          );
          ui.close();
          ui.notify('记录已更新');
        }}
        footer={
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              if (await ui.confirm('删除这条学习记录？')) {
                await db.sessions.delete(s.id);
                ui.close();
              }
            }}
          >
            删除
          </Button>
        }
      >
        <div className="form-grid">
          <Field label="开始时间">
            <input
              type="datetime-local"
              required
              value={dateTimeInput(s.start)}
              onChange={(e) => {
                setTimesEdited(true);
                patch({ start: fromInput(e.target.value) });
              }}
            />
          </Field>
          <Field label="有效时长（分钟）">
            <input
              type="number"
              required
              step="0.01"
              min="0.02"
              max="525600"
              value={minutes}
              onChange={(e) => {
                setTimesEdited(true);
                setMinutes(e.target.value);
              }}
            />
          </Field>
          <Field label="关联课程">
            <CourseSelect
              value={s.courseId}
              onChange={(courseId) => patch({ courseId: courseId || undefined })}
            />
          </Field>
          <Field label="关联任务">
            <select
              value={s.taskId ?? ''}
              onChange={(e) => patch({ taskId: e.target.value || undefined })}
            >
              <option value="">不关联任务</option>
              {data.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="学习记录" wide>
            <textarea value={s.note} onChange={(e) => patch({ note: e.target.value })} />
          </Field>
        </div>
        <p className="muted">修改时间后，将以开始时间起的连续区间重新统计。</p>
      </SaveForm>
    </Modal>
  );
}
function OverrideEditor({ editor }: { editor: Editor }) {
  const data = useStore(),
    ui = useUI();
  const occ = editor.occurrence;
  const existing = data.overrides.find((o) => o.id === editor.id);
  const [o, set] = useState<Override>(
    existing ?? {
      id: id(),
      date: occ?.date ?? localDate(),
      courseId: editor.courseId ?? data.courses[0]?.id ?? '',
      slotId: occ?.slotId,
      kind: occ ? 'cancel' : 'extra',
      start: occ?.start ?? 1,
      end: occ?.end ?? 2,
      room: occ?.room ?? '',
      targetDate: occ?.date ?? localDate(),
    },
  );
  const patch = (p: Partial<Override>) => set({ ...o, ...p });
  return (
    <Modal title="临时调整" onClose={ui.close}>
      <SaveForm
        onSave={async () => {
          if (o.end > (data.settings.semester?.periods.length ?? 20))
            throw Error('节次超出学期设置');
          if (o.kind !== 'extra' && !o.slotId) throw Error('请在课程表点击原课程后调整');
          const valid = overrideSchema.parse(o);
          await db.transaction('rw', db.overrides, async () => {
            if (valid.kind !== 'extra') {
              const old = await db.overrides
                .filter(
                  (v) =>
                    v.id !== valid.id &&
                    v.kind !== 'extra' &&
                    v.date === valid.date &&
                    v.courseId === valid.courseId &&
                    v.slotId === valid.slotId,
                )
                .toArray();
              await db.overrides.bulkDelete(old.map((v) => v.id));
            }
            await db.overrides.put(valid);
          });
          ui.close();
          ui.notify('调整已保存，循环课程不变');
        }}
        footer={
          existing ? (
            <Button
              type="button"
              variant="danger"
              onClick={async () => {
                if (await ui.confirm('撤销这次临时调整？')) {
                  await db.overrides.delete(o.id);
                  ui.close();
                }
              }}
            >
              撤销调整
            </Button>
          ) : null
        }
      >
        <div className="form-grid">
          <Field label="课程">
            <select
              required
              value={o.courseId}
              disabled={!!occ}
              onChange={(e) => patch({ courseId: e.target.value })}
            >
              <option value="">选择课程</option>
              {data.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="调整类型">
            <select
              value={o.kind}
              onChange={(e) => patch({ kind: e.target.value as Override['kind'] })}
            >
              {(occ || existing?.slotId) && (
                <>
                  <option value="cancel">单次停课</option>
                  <option value="move">临时调课</option>
                </>
              )}
              <option value="extra">临时加课</option>
            </select>
          </Field>
          <Field label={o.kind === 'extra' ? '加课日期' : '原上课日期'}>
            <input
              type="date"
              required
              value={o.date}
              disabled={!!occ && o.kind !== 'extra'}
              onChange={(e) => patch({ date: e.target.value })}
            />
          </Field>
          {o.kind === 'move' && (
            <Field label="调整至">
              <input
                type="date"
                required
                value={o.targetDate ?? o.date}
                onChange={(e) => patch({ targetDate: e.target.value })}
              />
            </Field>
          )}
          {o.kind !== 'cancel' && (
            <>
              <Field label="开始节次">
                <input
                  required
                  type="number"
                  min="1"
                  max="20"
                  value={o.start}
                  onChange={(e) => patch({ start: +e.target.value })}
                />
              </Field>
              <Field label="结束节次">
                <input
                  required
                  type="number"
                  min={o.start}
                  max="20"
                  value={o.end}
                  onChange={(e) => patch({ end: +e.target.value })}
                />
              </Field>
              <Field label="教室">
                <input value={o.room} onChange={(e) => patch({ room: e.target.value })} />
              </Field>
            </>
          )}
        </div>
      </SaveForm>
    </Modal>
  );
}
