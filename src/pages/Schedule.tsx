import { useState } from 'react';
import {
  Plus,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Play,
  CalendarDays,
  Undo2,
  Trash2,
} from 'lucide-react';
import { db } from '../lib/db';
import { useStore, useUI, go } from '../lib/context';
import {
  occurrences,
  teachingWeek,
  sortTasks,
  freeSlots,
  overlaps,
  type Occurrence,
} from '../lib/logic';
import {
  localDate,
  addDays,
  monday,
  clockTime,
  shortDate,
  examDays,
  fullDate,
  atTime,
  fromInput,
} from '../lib/time';
import { weekdays } from '../lib/models';
import {
  Button,
  IconButton,
  Tabs,
  Empty,
  SectionTitle,
  Field,
  Modal,
  SaveForm,
} from '../components/ui';
import { TaskList } from '../components/TaskList';
export default function Schedule({ path }: { path: string }) {
  const ui = useUI();
  const tab = path.includes('tasks')
    ? 'tasks'
    : path.includes('exams')
      ? 'exams'
      : path.includes('plan')
        ? 'plan'
        : 'courses';
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>日程</h1>
        </div>
        <Button
          onClick={() =>
            ui.open({ kind: tab === 'courses' ? 'course' : tab === 'exams' ? 'exam' : 'task' })
          }
        >
          <Plus size={18} />
          {tab === 'courses' ? '新建课程' : tab === 'exams' ? '新建考试' : '新建任务'}
        </Button>
      </div>
      <Tabs
        value={tab}
        items={[
          { value: 'courses', label: '课程表' },
          { value: 'tasks', label: '任务' },
          { value: 'exams', label: '考试' },
          { value: 'plan', label: '自习安排' },
        ]}
        onChange={(t) => go(`/schedule/${t}`)}
      />
      {tab === 'courses' ? (
        <Timetable />
      ) : tab === 'tasks' ? (
        <Tasks />
      ) : tab === 'exams' ? (
        <Exams />
      ) : (
        <Plan />
      )}
    </>
  );
}
function Timetable() {
  const d = useStore(),
    ui = useUI(),
    semester = d.settings.semester;
  const current = teachingWeek(localDate(), semester);
  const [week, setWeek] = useState(Math.max(1, Math.min(semester?.weeks ?? 1, current)));
  if (!semester)
    return (
      <section className="panel">
        <Empty title="从一个新学期开始" action="设置学期" onAction={() => go('/me/semester')} />
      </section>
    );
  const first = addDays(monday(semester.start), (week - 1) * 7);
  const dates = weekdays.map((_, i) => addDays(first, i));
  return (
    <>
      <div className="toolbar">
        <div className="week-control">
          <IconButton label="上一周" disabled={week <= 1} onClick={() => setWeek(week - 1)}>
            <ChevronLeft size={19} />
          </IconButton>
          <h2>第 {week} 周</h2>
          <IconButton
            label="下一周"
            disabled={week >= semester.weeks}
            onClick={() => setWeek(week + 1)}
          >
            <ChevronRight size={19} />
          </IconButton>
          <button
            className="text-button"
            onClick={() => setWeek(Math.max(1, Math.min(semester.weeks, current)))}
          >
            本周
          </button>
        </div>
        <Button
          variant="secondary"
          disabled={!d.courses.length}
          onClick={() => ui.open({ kind: 'override' })}
        >
          <Plus size={16} />
          临时加课
        </Button>
      </div>
      <div className="timetable-scroll panel">
        <div className="timetable" style={{ minWidth: 760 }}>
          <div className="period-column">
            <div className="timetable-day semester-name">{semester.name}</div>
            {semester.periods.map((p, i) => (
              <div key={i} className="period">
                <strong>{i + 1}</strong>
                <time>
                  {p.start}
                  <br />
                  {p.end}
                </time>
              </div>
            ))}
          </div>
          {dates.map((date, i) => {
            const lessons = occurrences(date, d.courses, d.overrides, semester);
            const lanes: Occurrence[][] = [];
            const layout = lessons.map((l) => {
              let lane = lanes.findIndex((items) => items.every((o) => !overlaps(l, o)));
              if (lane < 0) {
                lane = lanes.length;
                lanes.push([]);
              }
              lanes[lane].push(l);
              return { l, lane };
            });
            return (
              <div
                className={`timetable-column ${date === localDate() ? 'today-column' : ''}`}
                key={date}
              >
                <div className="timetable-day">
                  <span>周{weekdays[i]}</span>
                  <strong>{shortDate(atTime(date, '12:00'))}</strong>
                </div>
                <div className="day-lessons" style={{ height: semester.periods.length * 76 }}>
                  {semester.periods.map((_, i) => (
                    <div key={i} className="lesson-line" style={{ top: i * 76 }} />
                  ))}
                  {layout.map(({ l, lane }) => {
                    const conflict = lessons.some((o) => o.key !== l.key && overlaps(l, o));
                    return (
                      <button
                        key={l.key}
                        className="lesson"
                        style={
                          {
                            top: (l.start - 1) * 76 + 4,
                            height: (l.end - l.start + 1) * 76 - 8,
                            left: `calc(${(lane / lanes.length) * 100}% + 3px)`,
                            width: `calc(${100 / lanes.length}% - 6px)`,
                            '--course-color': l.course.color,
                          } as React.CSSProperties
                        }
                        onClick={() => ui.open({ kind: 'course', id: l.course.id, occurrence: l })}
                      >
                        <strong>{l.course.name}</strong>
                        <span>{l.room || '未设教室'}</span>
                        <span>
                          {l.start}–{l.end} 节
                        </span>
                        {l.adjusted && <span>临时调整</span>}
                        {conflict && <span className="conflict">时间冲突</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <section className="panel compact-panel">
        <SectionTitle action="新建课程" onAction={() => ui.open({ kind: 'course' })}>
          全部课程 <span className="count">{d.courses.length}</span>
        </SectionTitle>
        <div className="course-chips">
          {d.courses.map((c) => (
            <button key={c.id} onClick={() => ui.open({ kind: 'course', id: c.id })}>
              <i style={{ background: c.color }} />
              {c.name}
            </button>
          ))}
        </div>
        {!d.courses.length && <p className="muted">还没有课程</p>}
      </section>
      {!!d.overrides.length && (
        <section className="panel">
          <SectionTitle>临时调整</SectionTitle>
          {d.overrides.map((o) => (
            <div className="adjustment-row" key={o.id}>
              <button
                className="text-button"
                onClick={() => ui.open({ kind: 'override', id: o.id })}
              >
                {d.courses.find((c) => c.id === o.courseId)?.name} · {o.date} ·{' '}
                {{ cancel: '停课', move: '调课', extra: '加课' }[o.kind]}
                {o.kind === 'move' ? ` → ${o.targetDate}` : ''}
              </button>
              <IconButton
                label="撤销调整"
                onClick={async () => {
                  if (await ui.confirm('撤销这次调整？')) await db.overrides.delete(o.id);
                }}
              >
                <Undo2 size={17} />
              </IconButton>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
function Tasks() {
  const d = useStore(),
    ui = useUI();
  const [view, setView] = useState('today'),
    [course, setCourse] = useState(''),
    [priority, setPriority] = useState(''),
    [sort, setSort] = useState('priority'),
    [search, setSearch] = useState('');
  const today = localDate();
  let tasks = d.tasks.filter(
    (t) =>
      (view === 'done' ? t.done : !t.done) &&
      (view === 'today'
        ? localDate(t.due) <= today
        : view === 'soon'
          ? localDate(t.due) >= today && localDate(t.due) <= addDays(today, 7)
          : true) &&
      (!course || t.courseId === course) &&
      (!priority || t.priority === priority) &&
      t.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  tasks = sort === 'priority' ? sortTasks(tasks) : tasks.sort((a, b) => a.due - b.due);
  return (
    <section className="panel">
      <div className="task-filters">
        <div className="segmented">
          {[
            ['today', '今天'],
            ['soon', '即将截止'],
            ['all', '全部'],
            ['done', '已完成'],
          ].map(([v, l]) => (
            <button
              className={view === v ? 'active' : ''}
              aria-pressed={view === v}
              key={v}
              onClick={() => setView(v)}
            >
              {l}
            </button>
          ))}
        </div>
        <input
          className="search"
          aria-label="搜索任务"
          placeholder="搜索任务"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="filter-row">
        <select aria-label="筛选课程" value={course} onChange={(e) => setCourse(e.target.value)}>
          <option value="">全部课程</option>
          {d.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="筛选优先级"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">全部优先级</option>
          <option value="high">高</option>
          <option value="medium">中</option>
          <option value="low">低</option>
        </select>
        <select aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="priority">优先级排序</option>
          <option value="time">截止时间排序</option>
        </select>
      </div>
      {tasks.length ? (
        <TaskList tasks={tasks} />
      ) : (
        <Empty
          title="没有符合条件的任务"
          action="添加任务"
          onAction={() => ui.open({ kind: 'task' })}
        />
      )}
    </section>
  );
}
function Exams() {
  const d = useStore(),
    ui = useUI();
  const [archived, setArchived] = useState(false);
  const exams = d.exams
    .filter((e) => (archived ? e.archived || e.at < Date.now() : !e.archived && e.at >= Date.now()))
    .sort((a, b) => a.at - b.at);
  return (
    <>
      <div className="toolbar">
        <h2>{archived ? '已结束与归档' : '即将到来'}</h2>
        <button className="text-button" onClick={() => setArchived(!archived)}>
          {archived ? '即将到来' : '已结束 / 归档'}
        </button>
      </div>
      <div className="exam-grid">
        {exams.map((e) => (
          <article className="panel exam-card" key={e.id}>
            <div className="exam-top">
              <CalendarDays size={21} />
              <span>{d.courses.find((c) => c.id === e.courseId)?.name ?? '考试'}</span>
              <button className="text-button" onClick={() => ui.open({ kind: 'exam', id: e.id })}>
                编辑
              </button>
            </div>
            <h2>{e.name}</h2>
            <div className="countdown">
              {e.at < Date.now() ? (
                <strong>已结束</strong>
              ) : examDays(e.at) === 0 ? (
                <strong>今天</strong>
              ) : (
                <>
                  <strong>{examDays(e.at)}</strong>
                  <span>天后</span>
                </>
              )}
            </div>
            <div className="exam-meta">
              <time>{fullDate(e.at)}</time>
              <span>
                <MapPin size={15} />
                {e.room || '未设地点'}
              </span>
            </div>
            {!!e.taskIds.length && (
              <div className="exam-linked-tasks">
                {d.tasks
                  .filter((t) => e.taskIds.includes(t.id))
                  .map((t) => (
                    <button
                      className="text-button"
                      key={t.id}
                      onClick={() => ui.open({ kind: 'task', id: t.id })}
                    >
                      {t.done ? '✓ ' : ''}
                      {t.title}
                    </button>
                  ))}
              </div>
            )}
            <div className="exam-actions">
              <Button variant="secondary" onClick={() => ui.focus(e.courseId)}>
                <Play size={15} />
                开始复习
              </Button>
              <IconButton
                label={e.archived ? '取消归档' : '归档考试'}
                onClick={() => db.exams.update(e.id, { archived: !e.archived })}
              >
                <Undo2 size={17} />
              </IconButton>
            </div>
          </article>
        ))}
      </div>
      {!exams.length && (
        <section className="panel">
          <Empty
            title={archived ? '没有已结束的考试' : '近期没有考试'}
            action="添加考试"
            onAction={() => ui.open({ kind: 'exam' })}
          />
        </section>
      )}
    </>
  );
}
function Plan() {
  const d = useStore(),
    ui = useUI();
  const [date, setDate] = useState(localDate()),
    [slot, setSlot] = useState<{ startAt: number; endAt: number }>(),
    [taskId, setTaskId] = useState('');
  const lessons = occurrences(date, d.courses, d.overrides, d.settings.semester),
    free = freeSlots(date, lessons, d.tasks, d.exams);
  const scheduled = d.tasks
    .filter((t) => !t.done && t.scheduledStart && localDate(t.scheduledStart) === date)
    .sort((a, b) => a.scheduledStart! - b.scheduledStart!);
  const [start, setStart] = useState('');
  return (
    <>
      <div className="toolbar">
        <h2>可用时间</h2>
        <input
          type="date"
          aria-label="自习日期"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      {!d.settings.semester && <p className="notice">尚未设置课程表，空闲时间暂未计入课程。</p>}
      <div className="free-grid">
        {free.map((s) => (
          <button
            className="panel free-slot"
            key={s.startAt}
            onClick={() => {
              setSlot(s);
              setStart(new Date(s.startAt).toTimeString().slice(0, 5));
            }}
          >
            <span>
              {clockTime(s.startAt)}
              <span className="muted"> — </span>
              {clockTime(s.endAt)}
            </span>
            <span>
              {Math.floor((s.endAt - s.startAt) / 60000)} 分钟 <Plus size={17} />
            </span>
          </button>
        ))}
      </div>
      {!free.length && <Empty title="当天没有超过 30 分钟的空闲时段" />}
      <section className="panel">
        <SectionTitle>已安排自习</SectionTitle>
        {scheduled.map((t) => (
          <div className="plan-row" key={t.id}>
            <div>
              <button className="text-button" onClick={() => ui.open({ kind: 'task', id: t.id })}>
                {t.title}
              </button>
              <p className="muted">
                {clockTime(t.scheduledStart!)} – {clockTime(t.scheduledEnd!)}
              </p>
            </div>
            <IconButton
              label="取消自习安排"
              onClick={() =>
                db.tasks.update(t.id, { scheduledStart: undefined, scheduledEnd: undefined })
              }
            >
              <Trash2 size={17} />
            </IconButton>
          </div>
        ))}
        {!scheduled.length && <Empty title="还没有安排自习" />}
      </section>
      {slot && (
        <Modal title="安排自习" onClose={() => setSlot(undefined)}>
          <SaveForm
            onSave={async () => {
              const task = d.tasks.find((t) => t.id === taskId);
              if (!task) throw Error('请选择任务');
              const scheduledStart = fromInput(`${date}T${start}`),
                scheduledEnd = scheduledStart + task.estimate * 60000;
              if (
                !freeSlots(
                  date,
                  lessons,
                  d.tasks.filter((t) => t.id !== taskId),
                  d.exams,
                ).some((s) => scheduledStart >= s.startAt && scheduledEnd <= s.endAt)
              )
                throw Error('该时段放不下任务的预计耗时');
              if (scheduledStart < Date.now()) throw Error('请选择未来的时间');
              await db.tasks.update(taskId, { scheduledStart, scheduledEnd });
              setSlot(undefined);
              ui.notify('自习已安排');
            }}
          >
            <div className="form-grid">
              <Field label="任务" wide>
                <select required value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                  <option value="">选择待完成任务</option>
                  {d.tasks
                    .filter((t) => !t.done)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title} · {t.estimate} 分钟
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="开始时间">
                <input
                  required
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
            </div>
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
