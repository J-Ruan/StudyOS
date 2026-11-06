import {
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  CheckCheck,
  Timer,
  MapPin,
  Clock3,
  Plus,
  Play,
} from 'lucide-react';
import { useStore, useUI, go } from '../lib/context';
import { occurrences, sortTasks, dailySeconds } from '../lib/logic';
import { localDate, clockTime, examDays, fullDate } from '../lib/time';
import { Button, Empty, SectionTitle } from '../components/ui';
import { TaskList } from '../components/TaskList';
export default function Dashboard() {
  const d = useStore(),
    ui = useUI(),
    today = localDate(),
    now = Date.now();
  const lessons = occurrences(today, d.courses, d.overrides, d.settings.semester);
  const next = lessons.find((l) => l.endAt > now);
  const pending = d.tasks.filter((t) => !t.done),
    tasks = sortTasks(pending.filter((t) => localDate(t.due) <= today));
  const exam = d.exams
    .filter((e) => !e.archived && e.at >= now && examDays(e.at) <= 30)
    .sort((a, b) => a.at - b.at)[0];
  const seconds = dailySeconds(d.sessions).get(today) ?? 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {new Date().toLocaleDateString('zh-CN', {
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </p>
          <h1>今天</h1>
        </div>
        <Button onClick={() => ui.open({ kind: 'task' })}>
          <Plus size={18} />
          新建任务
        </Button>
      </div>
      <div className="overview">
        <button onClick={() => go('/schedule')}>
          <span>
            <CalendarDays size={18} />
            今日课程
            <ArrowUpRight size={16} />
          </span>
          <strong>
            {lessons.length}
            <small>节</small>
          </strong>
        </button>
        <button onClick={() => go('/schedule/tasks')}>
          <span>
            <CheckCheck size={18} />
            待完成任务
            <ArrowUpRight size={16} />
          </span>
          <strong>
            {pending.length}
            <small>项</small>
          </strong>
        </button>
        <button onClick={() => go('/stats')}>
          <span>
            <Timer size={18} />
            今日专注
            <ArrowUpRight size={16} />
          </span>
          <strong>
            {Math.floor(seconds / 3600)}
            <small>h</small>
            {Math.floor((seconds % 3600) / 60)}
            <small>m</small>
          </strong>
        </button>
      </div>
      <div className="dashboard-grid">
        <div className="dashboard-main">
          <section className="panel tasks-panel">
            <SectionTitle action="查看全部" onAction={() => go('/schedule/tasks')}>
              今日任务 <span className="count">{tasks.length}</span>
            </SectionTitle>
            {tasks.length ? (
              <TaskList tasks={tasks.slice(0, 5)} />
            ) : (
              <Empty title={d.tasks.length ? '今日任务已完成' : '今天没有待办'} />
            )}
            <button className="add-row" onClick={() => ui.open({ kind: 'task' })}>
              <Plus size={17} />
              添加任务
            </button>
          </section>
          <section className="panel">
            <SectionTitle action="周课表" onAction={() => go('/schedule')}>
              接下来的课程
            </SectionTitle>
            {next ? (
              <button
                className="next-course"
                onClick={() => ui.open({ kind: 'course', id: next.course.id, occurrence: next })}
              >
                <span className="course-marker" style={{ background: next.course.color }} />
                <div>
                  <span className="status-label">
                    {next.startAt <= now ? '正在上课' : '下一节'}
                  </span>
                  <h3>{next.course.name}</h3>
                  <div className="course-meta">
                    <span>
                      <Clock3 size={15} />
                      {clockTime(next.startAt)} – {clockTime(next.endAt)}
                    </span>
                    <span>
                      <MapPin size={15} />
                      {next.room || '未设置教室'}
                    </span>
                  </div>
                </div>
                <ArrowUpRight size={20} />
              </button>
            ) : d.settings.semester && d.courses.length ? (
              <div className="quiet-empty">
                <CheckCheck size={18} />
                <span>今天没有剩余课程</span>
              </div>
            ) : (
              <Empty
                title={d.settings.semester ? '还没有课程' : '还没有设置学期'}
                action={d.settings.semester ? '添加课程' : '设置学期'}
                onAction={() =>
                  d.settings.semester ? ui.open({ kind: 'course' }) : go('/me/semester')
                }
              />
            )}
          </section>
        </div>
        <aside className="dashboard-aside">
          <section className="focus-card">
            <span className="focus-symbol">
              <Timer size={26} />
            </span>
            <h2>{d.timer ? '计时进行中' : '25:00'}</h2>
            <div className="focus-card-bottom">
              <span>{d.timer ? '继续当前计时' : '番茄专注'}</span>
              <Button onClick={() => ui.focus()}>
                <Play size={16} fill="currentColor" />
                {d.timer ? '返回专注' : '开始专注'}
              </Button>
            </div>
          </section>
          {exam && (
            <section className="panel exam-teaser">
              <SectionTitle action="全部考试" onAction={() => go('/schedule/exams')}>
                近期考试
              </SectionTitle>
              <button onClick={() => ui.open({ kind: 'exam', id: exam.id })}>
                <div>
                  <h3>{exam.name}</h3>
                  <time>{fullDate(exam.at)}</time>
                </div>
                <strong>
                  {examDays(exam.at) === 0 ? (
                    '今天'
                  ) : (
                    <>
                      {examDays(exam.at)}
                      <small>天</small>
                    </>
                  )}
                </strong>
              </button>
            </section>
          )}
          <button className="weekly-link" onClick={() => go('/stats/review')}>
            <span>
              <span className="eyebrow">每周复盘</span>
              <strong>回顾这一周</strong>
            </span>
            <ArrowRight size={21} />
          </button>
        </aside>
      </div>
    </>
  );
}
