import { useMemo, useState } from 'react';
import { Plus, Play, Pencil, Trash2, Check } from 'lucide-react';
import { db } from '../lib/db';
import { useStore, useUI } from '../lib/context';
import { id, preferences, type StudyPlan } from '../lib/models';
import { availableSlots, generatePlans, savePlans } from '../lib/planner';
import { localDate, atTime, fromInput, dateTimeInput, clockTime } from '../lib/time';
import { Button, Field, Modal, SaveForm, SectionTitle, Empty, IconButton } from '../components/ui';
export default function StudyPlans() {
  const d = useStore(),
    ui = useUI(),
    prefs = preferences(d.settings);
  const [date, setDate] = useState(localDate()),
    [editing, setEditing] = useState<StudyPlan>(),
    [preview, setPreview] = useState<StudyPlan[]>(),
    [skipped, setSkipped] = useState<{ title: string; reason: string }[]>([]),
    [start, setStart] = useState(prefs.studyStart),
    [end, setEnd] = useState(prefs.studyEnd),
    [days, setDays] = useState(7),
    [generate, setGenerate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const legacy = useMemo(
    () =>
      d.tasks
        .filter(
          (t) =>
            t.scheduledStart !== undefined &&
            t.scheduledEnd !== undefined &&
            !(d.plans ?? []).some((p) => p.id === `legacy:${t.id}`),
        )
        .map((t) => ({
          id: `legacy:${t.id}`,
          title: t.title,
          taskId: t.id,
          courseId: t.courseId,
          start: t.scheduledStart!,
          end: t.scheduledEnd!,
          done: t.done,
        })),
    [d.tasks, d.plans],
  );
  const plans = [...(d.plans ?? []), ...legacy];
  const data = { ...d, plans };
  const free = availableSlots(date, data, start, end).filter(
    (s) => s.endAt - s.startAt >= 15 * 60000,
  );
  const visible = plans
    .filter((p) => localDate(p.start) === date)
    .sort((a, b) => a.start - b.start);
  const patch = (p: Partial<StudyPlan>) => setEditing(editing ? { ...editing, ...p } : undefined);
  const create = (at = atTime(date, start)) => {
    setEditing({
      id: id(),
      title: '自习',
      start: Math.max(at, Math.ceil((Date.now() + 60000) / 60000) * 60000),
      end: Math.max(at, Math.ceil((Date.now() + 60000) / 60000) * 60000) + 25 * 60000,
      done: false,
    });
  };
  async function cancel(p: StudyPlan) {
    if (!(await ui.confirm('取消这段自习安排？'))) return;
    await db.transaction('rw', [db.plans, db.tasks], async () => {
      await db.plans.delete(p.id);
      if (p.id === `legacy:${p.taskId}`)
        await db.tasks.update(p.taskId!, { scheduledStart: undefined, scheduledEnd: undefined });
    });
  }
  return (
    <>
      <div className="toolbar">
        <input
          aria-label="自习日期"
          type="date"
          value={date}
          onChange={(e) => {
            if (e.target.value) setDate(e.target.value);
          }}
        />
        <div className="inline-actions">
          <Button
            variant="secondary"
            onClick={() => {
              setGenerate(true);
              setError('');
            }}
          >
            生成学习计划
          </Button>
          <Button onClick={() => create()}>
            <Plus size={17} />
            手动安排
          </Button>
        </div>
      </div>
      <section className="panel">
        <SectionTitle>已安排自习</SectionTitle>
        {visible.map((p) => (
          <div className={`plan-row ${p.done ? 'plan-done' : ''}`} key={p.id}>
            <div>
              <strong>{p.title}</strong>
              <p className="muted">
                {clockTime(p.start)} – {clockTime(p.end)}
                {p.done ? ' · 已完成' : p.end < Date.now() ? ' · 未完成' : ''}
              </p>
            </div>
            <div className="inline-actions">
              {!p.done && (
                <IconButton
                  label={`开始自习 ${p.title}`}
                  onClick={() => ui.focus(p.courseId, p.taskId)}
                >
                  <Play size={18} />
                </IconButton>
              )}
              <IconButton
                label={p.done ? '重新打开自习' : '完成自习'}
                onClick={async () => {
                  await db.plans.put({ ...p, done: !p.done });
                }}
              >
                <Check size={18} />
              </IconButton>
              <IconButton label={`修改自习 ${p.title}`} onClick={() => setEditing(p)}>
                <Pencil size={18} />
              </IconButton>
              <IconButton label="取消自习安排" onClick={() => void cancel(p)}>
                <Trash2 size={18} />
              </IconButton>
            </div>
          </div>
        ))}
        {!visible.length && <Empty title="还没有安排自习" />}
      </section>
      <details className="free-time-details" open>
        <summary>可用时间</summary>
        {!d.settings.semester && <p className="notice">尚未设置课程表，空闲时间暂未计入课程。</p>}
        <div className="free-grid">
          {free.map((s) => (
            <button className="panel free-slot" key={s.startAt} onClick={() => create(s.startAt)}>
              <span>
                {clockTime(s.startAt)} — {clockTime(s.endAt)}
              </span>
              <Plus size={17} />
            </button>
          ))}
        </div>
        {!free.length && <Empty title="当天没有足够的空闲时间" />}
      </details>
      {plans.some((p) => !p.done && p.end < Date.now() && localDate(p.start) !== date) && (
        <details className="panel">
          <summary>未完成的学习安排</summary>
          {plans
            .filter((p) => !p.done && p.end < Date.now() && localDate(p.start) !== date)
            .slice(0, 40)
            .map((p) => (
              <button
                className="text-button"
                key={p.id}
                onClick={() => setDate(localDate(p.start))}
              >
                {p.title} · {dateTimeInput(p.start).replace('T', ' ')}
              </button>
            ))}
        </details>
      )}
      {editing && (
        <Modal title="安排自习" onClose={() => setEditing(undefined)}>
          <SaveForm
            onSave={async () => {
              const draft = { ...editing };
              await savePlans([draft]);
              setEditing(undefined);
              ui.notify('自习已安排');
            }}
          >
            <div className="form-grid">
              <Field label="任务" wide>
                <select
                  value={editing.taskId ?? ''}
                  onChange={(e) => {
                    const t = d.tasks.find((t) => t.id === e.target.value);
                    patch(
                      t
                        ? {
                            taskId: t.id,
                            courseId: t.courseId,
                            title: t.title,
                            end: editing.start + t.estimate * 60000,
                          }
                        : { taskId: undefined, courseId: undefined },
                    );
                  }}
                >
                  <option value="">自由自习</option>
                  {d.tasks
                    .filter((t) => !t.done)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.estimate} 分钟
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="计划名称" wide>
                <input
                  required
                  maxLength={200}
                  value={editing.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
              </Field>
              <Field label="自习开始日期">
                <input
                  type="date"
                  required
                  value={localDate(editing.start)}
                  onChange={(e) =>
                    patch({
                      start: atTime(
                        e.target.value,
                        new Date(editing.start).toTimeString().slice(0, 5),
                      ),
                    })
                  }
                />
              </Field>
              <Field label="开始时间">
                <input
                  type="time"
                  required
                  value={new Date(editing.start).toTimeString().slice(0, 5)}
                  onChange={(e) => {
                    const at = atTime(localDate(editing.start), e.target.value);
                    patch({ start: at, end: at + (editing.end - editing.start) });
                  }}
                />
              </Field>
              <Field label="结束时间">
                <input
                  type="datetime-local"
                  required
                  value={dateTimeInput(editing.end)}
                  onChange={(e) => patch({ end: fromInput(e.target.value) })}
                />
              </Field>
            </div>
          </SaveForm>
        </Modal>
      )}
      {generate && (
        <Modal
          title="生成学习计划"
          onClose={() => {
            if (!busy) setGenerate(false);
          }}
        >
          <SaveForm
            onSave={async () => {
              const result = generatePlans(data, { start, end, days });
              setPreview(result.proposed);
              setSkipped(result.skipped);
              setGenerate(false);
            }}
          >
            <div className="form-grid">
              <Field label="每天最早开始">
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="每天最晚结束">
                <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} />
              </Field>
              <Field label="未来天数">
                <input
                  type="number"
                  min="1"
                  max="31"
                  required
                  value={days}
                  onChange={(e) => setDays(+e.target.value)}
                />
              </Field>
            </div>
          </SaveForm>
        </Modal>
      )}
      {preview && (
        <Modal
          title="学习计划预览"
          wide
          onClose={() => {
            if (!busy) setPreview(undefined);
          }}
        >
          <p className="muted">{preview.length} 段安排 · 确认后才写入</p>
          <div className="plan-preview">
            {preview.map((p, i) => (
              <div className="panel" key={p.id}>
                <Field label={`计划 ${i + 1}`}>
                  <input
                    value={p.title}
                    onChange={(e) =>
                      setPreview(
                        preview.map((v) => (v.id === p.id ? { ...v, title: e.target.value } : v)),
                      )
                    }
                  />
                </Field>
                <div className="form-grid">
                  <Field label={`计划 ${i + 1} 开始`}>
                    <input
                      type="datetime-local"
                      value={dateTimeInput(p.start)}
                      onChange={(e) =>
                        setPreview(
                          preview.map((v) =>
                            v.id === p.id
                              ? {
                                  ...v,
                                  start: fromInput(e.target.value),
                                  end: fromInput(e.target.value) + (p.end - p.start),
                                }
                              : v,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label={`计划 ${i + 1} 结束`}>
                    <input
                      type="datetime-local"
                      value={dateTimeInput(p.end)}
                      onChange={(e) =>
                        setPreview(
                          preview.map((v) =>
                            v.id === p.id ? { ...v, end: fromInput(e.target.value) } : v,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => setPreview(preview.filter((v) => v.id !== p.id))}
                >
                  移除此安排
                </Button>
              </div>
            ))}
          </div>
          {skipped.map((s, i) => (
            <p className="notice" key={i}>
              {s.title}：{s.reason}
            </p>
          ))}
          {!preview.length && !skipped.length && <Empty title="没有待安排的任务" />}
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <div className="form-footer">
            <Button
              disabled={busy || !preview.length}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await savePlans(preview);
                  setDate(localDate(preview[0].start));
                  setPreview(undefined);
                  ui.notify('学习计划已保存');
                } catch (e) {
                  setError(String(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认保存计划
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
