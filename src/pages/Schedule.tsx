import { useRef, useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, MapPin, Play, CalendarDays, Undo2 } from 'lucide-react';
import { db } from '../lib/db';
import { useStore, useUI, go } from '../lib/context';
import { occurrences, teachingWeek, sortTasks, overlaps, type Occurrence } from '../lib/logic';
import {
  localDate,
  addDays,
  monday,
  clockTime,
  shortDate,
  examDays,
  fullDate,
  atTime,
} from '../lib/time';
import { weekdays } from '../lib/models';
import { Button, IconButton, Tabs, Empty, SectionTitle } from '../components/ui';
import { completeTask, deleteTask } from '../lib/actions';
import CourseImport from '../components/CourseImport';
import StudyPlans from './StudyPlans';
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
          <h1>
            {path.startsWith('/tasks')
              ? '任务'
              : import.meta.env.MODE === 'android'
                ? { courses: '课程', tasks: '任务', exams: '考试', plan: '学习计划' }[tab]
                : '日程'}
          </h1>
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
      {!path.startsWith('/tasks') && (
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
      )}
      {tab === 'courses' ? (
        <Timetable />
      ) : tab === 'tasks' ? (
        <Tasks />
      ) : tab === 'exams' ? (
        <Exams />
      ) : (
        <StudyPlans />
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
  const [view, setView] = useState<'day' | 'three' | 'week'>(() =>
    typeof matchMedia !== 'undefined' && matchMedia('(max-width: 600px)').matches ? 'day' : 'week',
  );
  const [date, setDate] = useState(localDate());
  const touch = useRef<{ x: number; y: number; edge: boolean } | undefined>(undefined);
  const shiftDate = (step: number) => {
    if (view === 'week') setWeek((w) => Math.max(1, Math.min(semester?.weeks ?? 1, w + step)));
    else setDate((day) => addDays(day, step * (view === 'three' ? 3 : 1)));
  };
  if (!semester)
    return (
      <section className="panel">
        <Empty title="从一个新学期开始" action="设置学期" onAction={() => go('/me/semester')} />
      </section>
    );
  const first = addDays(monday(semester.start), (week - 1) * 7);
  const dates = weekdays.map((_, i) => addDays(first, i));
  const visibleDates = Array.from({ length: view === 'three' ? 3 : 1 }, (_, i) => addDays(date, i));
  return (
    <>
      <div className="course-view-switch segmented" aria-label="课表显示模式">
        {(['day', 'three', 'week'] as const).map((mode) => (
          <button
            key={mode}
            className={view === mode ? 'active' : ''}
            aria-pressed={view === mode}
            onClick={() => {
              setView(mode);
              if (mode === 'week')
                setWeek(Math.max(1, Math.min(semester.weeks, teachingWeek(date, semester))));
            }}
          >
            {{ day: '今日', three: '三日', week: '周课表' }[mode]}
          </button>
        ))}
      </div>
      <CourseImport />
      {view !== 'week' && (
        <>
          <div className="toolbar">
            <div className="week-control">
              <IconButton label="上一段日期" onClick={() => shiftDate(-1)}>
                <ChevronLeft size={19} />
              </IconButton>
              <input
                type="date"
                aria-label="课表日期"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
              <IconButton label="下一段日期" onClick={() => shiftDate(1)}>
                <ChevronRight size={19} />
              </IconButton>
            </div>
            <Button variant="ghost" onClick={() => setDate(localDate())}>
              今天
            </Button>
          </div>
          <div
            className="agenda-days"
            onTouchStart={(e) => {
              const t = e.touches[0];
              touch.current = {
                x: t.clientX,
                y: t.clientY,
                edge: t.clientX < 28 || t.clientX > window.innerWidth - 28,
              };
            }}
            onTouchEnd={(e) => {
              const p = touch.current,
                t = e.changedTouches[0];
              if (p && !p.edge && Math.abs(t.clientX - p.x) > 70 && Math.abs(t.clientY - p.y) < 45)
                shiftDate(t.clientX < p.x ? 1 : -1);
              touch.current = undefined;
            }}
          >
            {visibleDates.map((day) => (
              <section key={day} className="agenda-day">
                <div className="section-title">
                  <h2>
                    {shortDate(atTime(day, '12:00'))} · 周
                    {
                      weekdays[
                        new Date(`${day}T12:00`).getDay() === 0
                          ? 6
                          : new Date(`${day}T12:00`).getDay() - 1
                      ]
                    }
                  </h2>
                  <span className="muted">
                    {teachingWeek(day, semester) >= 1 &&
                    teachingWeek(day, semester) <= semester.weeks
                      ? `第 ${teachingWeek(day, semester)} 周`
                      : '非教学周'}
                  </span>
                </div>
                {occurrences(day, d.courses, d.overrides, semester).map((l) => (
                  <button
                    className="agenda-lesson"
                    key={l.key}
                    style={{ '--course-color': l.course.color } as React.CSSProperties}
                    onClick={() => ui.open({ kind: 'course', id: l.course.id, occurrence: l })}
                  >
                    <time>
                      {clockTime(l.startAt)}
                      <span>{clockTime(l.endAt)}</span>
                    </time>
                    <div>
                      <h3>{l.course.name}</h3>
                      <p>{l.room || '未设置教室'}</p>
                    </div>
                    <span className="agenda-state">
                      {occurrences(day, d.courses, d.overrides, semester).some(
                        (other) => other.key !== l.key && overlaps(l, other),
                      )
                        ? '时间冲突'
                        : l.startAt <= Date.now() && l.endAt > Date.now()
                          ? '上课中'
                          : l.endAt <= Date.now()
                            ? '已结束'
                            : l.adjusted
                              ? '临时调整'
                              : ''}
                    </span>
                  </button>
                ))}
                {(d.plans ?? [])
                  .filter((p) => localDate(p.start) === day)
                  .map((p) => (
                    <button
                      key={p.id}
                      className="agenda-lesson agenda-plan"
                      onClick={() => go('/schedule/plan')}
                    >
                      <time>
                        {clockTime(p.start)}
                        <span>{clockTime(p.end)}</span>
                      </time>
                      <div>
                        <h3>{p.title}</h3>
                        <p>{p.done ? '自习已完成' : '自习'}</p>
                      </div>
                    </button>
                  ))}
                {!occurrences(day, d.courses, d.overrides, semester).length &&
                  !(d.plans ?? []).some((p) => localDate(p.start) === day) && (
                    <Empty title="这一天没有课程或自习" />
                  )}
              </section>
            ))}
          </div>
        </>
      )}
      <div className="toolbar">
        {view === 'week' && (
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
        )}
        <Button
          variant="secondary"
          disabled={!d.courses.length}
          onClick={() => ui.open({ kind: 'override' })}
        >
          <Plus size={16} />
          临时加课
        </Button>
      </div>
      {view === 'week' && (
        <div
          className="timetable-scroll panel"
          onTouchStart={(e) => {
            const t = e.touches[0];
            touch.current = {
              x: t.clientX,
              y: t.clientY,
              edge: t.clientX < 28 || t.clientX > window.innerWidth - 28,
            };
          }}
          onTouchEnd={(e) => {
            const p = touch.current,
              t = e.changedTouches[0],
              el = e.currentTarget;
            if (
              p &&
              !p.edge &&
              Math.abs(t.clientX - p.x) > 90 &&
              Math.abs(t.clientY - p.y) < 40 &&
              ((t.clientX > p.x && el.scrollLeft === 0) ||
                (t.clientX < p.x && el.scrollLeft + el.clientWidth >= el.scrollWidth - 2))
            )
              shiftDate(t.clientX < p.x ? 1 : -1);
            touch.current = undefined;
          }}
        >
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
                          onClick={() =>
                            ui.open({ kind: 'course', id: l.course.id, occurrence: l })
                          }
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
      )}
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
    [search, setSearch] = useState(''),
    [bulk, setBulk] = useState(false),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [limit, setLimit] = useState(40),
    [busy, setBusy] = useState(false);
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
              onClick={() => {
                setView(v);
                setSelected(new Set());
              }}
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
          onChange={(e) => {
            setSearch(e.target.value);
            setSelected(new Set());
          }}
        />
      </div>
      <div className="filter-row">
        <select
          aria-label="筛选课程"
          value={course}
          onChange={(e) => {
            setCourse(e.target.value);
            setSelected(new Set());
          }}
        >
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
          onChange={(e) => {
            setPriority(e.target.value);
            setSelected(new Set());
          }}
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
        <>
          <div className="bulk-toolbar">
            <Button
              variant="ghost"
              onClick={() => {
                setBulk(!bulk);
                setSelected(new Set());
              }}
            >
              {bulk ? '取消选择' : '批量选择'}
            </Button>
            {bulk && (
              <>
                <span>{selected.size} 项</span>
                <Button
                  disabled={busy || !selected.size}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await db.transaction('rw', db.tasks, async () => {
                        for (const id of selected) await completeTask(id);
                      });
                      setSelected(new Set());
                      ui.notify('所选任务已完成');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  批量完成
                </Button>
                <Button
                  variant="danger"
                  disabled={busy || !selected.size}
                  onClick={async () => {
                    if (
                      !(await ui.confirm(
                        `删除 ${selected.size} 个任务？`,
                        '已记录的专注时间会保留。',
                      ))
                    )
                      return;
                    setBusy(true);
                    try {
                      await db.transaction(
                        'rw',
                        [db.tasks, db.exams, db.sessions, db.timer, db.plans],
                        async () => {
                          for (const id of selected) await deleteTask(id);
                        },
                      );
                      setSelected(new Set());
                      ui.notify('所选任务已删除');
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  批量删除
                </Button>
              </>
            )}
          </div>
          <TaskList
            tasks={tasks.slice(0, limit)}
            selected={selected}
            onSelect={
              bulk
                ? (id) =>
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(id)) n.delete(id);
                      else n.add(id);
                      return n;
                    })
                : undefined
            }
          />
          {tasks.length > limit && (
            <Button variant="ghost" onClick={() => setLimit(limit + 40)}>
              加载更多（剩余 {tasks.length - limit}）
            </Button>
          )}
        </>
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
