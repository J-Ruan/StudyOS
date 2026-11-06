import { useState } from 'react';
import { ChevronLeft, ChevronRight, ArrowUpRight } from 'lucide-react';
import { useStore, useUI, go } from '../lib/context';
import { db } from '../lib/db';
import { localDate, monday, addDays, duration, daysBetween } from '../lib/time';
import { dailySeconds, rangeSeconds } from '../lib/logic';
import { Button, IconButton, Tabs, Empty, SectionTitle } from '../components/ui';
import Habits from './Habits';
export default function Stats({ path }: { path: string }) {
  const tab = path.includes('habits') ? 'habits' : path.includes('review') ? 'review' : 'stats';
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>学习统计</h1>
        </div>
        <button className="text-button" onClick={() => go('/focus/history')}>
          学习记录
          <ArrowUpRight size={16} />
        </button>
      </div>
      <Tabs
        value={tab}
        onChange={(t) => go(`/stats/${t}`)}
        items={[
          { value: 'stats', label: '概览' },
          { value: 'habits', label: '习惯' },
          { value: 'review', label: '每周复盘' },
        ]}
      />
      {tab === 'habits' ? <Habits /> : tab === 'review' ? <Review /> : <Overview />}
    </>
  );
}
function Overview() {
  const d = useStore();
  const [range, setRange] = useState('week'),
    [anchor, setAnchor] = useState(localDate());
  const from =
    range === 'day' ? anchor : range === 'week' ? monday(anchor) : `${anchor.slice(0, 7)}-01`;
  const monthEnd = new Date(+anchor.slice(0, 4), +anchor.slice(5, 7), 0).getDate();
  const to =
    range === 'day'
      ? anchor
      : range === 'week'
        ? addDays(from, 6)
        : `${anchor.slice(0, 7)}-${monthEnd}`;
  const days = Array.from({ length: daysBetween(from, to) + 1 }, (_, i) => addDays(from, i)),
    daily = dailySeconds(d.sessions),
    values = days.map((day) => daily.get(day) ?? 0),
    total = values.reduce((a, b) => a + b, 0),
    max = Math.max(1800, ...values);
  const relevant = d.sessions.filter((s) =>
    s.segments.some((seg) => localDate(seg.end) >= from && localDate(seg.start) <= to),
  );
  const completed = d.tasks.filter(
    (t) =>
      t.done && t.completedAt && localDate(t.completedAt) >= from && localDate(t.completedAt) <= to,
  ).length;
  const distribution = [
    ...d.courses.map((c) => ({ id: c.id, name: c.name, color: c.color })),
    { id: undefined, name: '自由专注', color: '#96939f' },
  ]
    .map((c) => ({
      ...c,
      seconds: rangeSeconds(
        d.sessions.filter((s) => s.courseId === c.id),
        from,
        to,
      ),
    }))
    .filter((c) => c.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  function shift(n: number) {
    if (range === 'month') {
      const date = new Date(`${anchor.slice(0, 7)}-01T12:00:00`);
      date.setMonth(date.getMonth() + n);
      setAnchor(localDate(date));
    } else setAnchor(addDays(anchor, n * (range === 'week' ? 7 : 1)));
  }
  return (
    <>
      <div className="toolbar stats-toolbar">
        <div className="segmented">
          {[
            ['day', '今日'],
            ['week', '每周'],
            ['month', '每月'],
          ].map(([v, l]) => (
            <button
              key={v}
              className={range === v ? 'active' : ''}
              onClick={() => {
                setRange(v);
                setAnchor(localDate());
              }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="week-control">
          <IconButton label="上一周期" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <span>
            {range === 'month'
              ? anchor.slice(0, 7).replace('-', ' 年 ') + ' 月'
              : range === 'day'
                ? from
                : `${from.slice(5).replace('-', '/')} – ${to.slice(5).replace('-', '/')}`}
          </span>
          <IconButton label="下一周期" disabled={to >= localDate()} onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      <div className="overview stats-overview">
        <div>
          <span>学习时长</span>
          <strong>
            {Math.floor(total / 3600)}
            <small>h</small>
            {Math.floor((total % 3600) / 60)}
            <small>m</small>
          </strong>
        </div>
        <div>
          <span>专注次数</span>
          <strong>
            {relevant.length}
            <small>次</small>
          </strong>
        </div>
        <div>
          <span>完成任务</span>
          <strong>
            {completed}
            <small>项</small>
          </strong>
        </div>
      </div>
      <div className="stats-grid">
        <section className="panel chart-panel">
          <SectionTitle>{range === 'month' ? '学习趋势' : '学习时长'}</SectionTitle>
          {total > 0 ? (
            <>
              <div
                className="bar-chart"
                role="img"
                aria-label={days
                  .map((day, i) => `${day}: ${Math.round(values[i] / 60)} 分钟`)
                  .join('；')}
              >
                <div className="chart-axis">
                  <span>{duration(max)}</span>
                  <span>{duration(max / 2)}</span>
                  <span>0</span>
                </div>
                <div className="chart-bars">
                  {days.map((day, i) => (
                    <div className="bar-column" key={day}>
                      <div
                        className={`bar ${day === localDate() ? 'bar-today' : ''}`}
                        style={{ height: `${(values[i] / max) * 100}%` }}
                        title={`${day} · ${duration(values[i])}`}
                      />
                      <span>
                        {range === 'month'
                          ? i % 5 === 0
                            ? i + 1
                            : ''
                          : range === 'day'
                            ? from.slice(5).replace('-', '/')
                            : ['一', '二', '三', '四', '五', '六', '日'][i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <Empty title="这一段时间，还没有学习记录" />
          )}
        </section>
        <section className="panel">
          <SectionTitle>课程投入</SectionTitle>
          {distribution.map((c) => (
            <div className="distribution" key={c.id ?? 'free'}>
              <div>
                <span>
                  <i style={{ background: c.color }} />
                  {c.name}
                </span>
                <strong>{duration(c.seconds)}</strong>
              </div>
              <div className="distribution-track">
                <span
                  style={{
                    width: `${(c.seconds / Math.max(1, total)) * 100}%`,
                    background: c.color,
                  }}
                />
              </div>
            </div>
          ))}
          {!distribution.length && <Empty title="还没有课程学习记录" />}
        </section>
      </div>
      {range === 'month' && (
        <section className="panel">
          <SectionTitle>每日投入</SectionTitle>
          <div className="study-heatmap">
            {days.map((day, i) => (
              <div
                key={day}
                title={`${day} · ${duration(values[i])}`}
                style={{ '--intensity': Math.min(1, values[i] / 7200) } as React.CSSProperties}
                className={values[i] > 0 ? 'has-study' : ''}
              >
                <span>{i + 1}</span>
                {values[i] > 0 && <strong>{Math.round(values[i] / 60)}m</strong>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
function Review() {
  const d = useStore(),
    ui = useUI();
  const [week, setWeek] = useState(monday());
  const to = addDays(week, 6),
    total = rangeSeconds(d.sessions, week, to),
    last = rangeSeconds(d.sessions, addDays(week, -7), addDays(week, -1));
  const completed = d.tasks.filter(
    (t) =>
      t.done && t.completedAt && localDate(t.completedAt) >= week && localDate(t.completedAt) <= to,
  ).length;
  const top = d.courses
    .map((c) => ({
      ...c,
      seconds: rangeSeconds(
        d.sessions.filter((s) => s.courseId === c.id),
        week,
        to,
      ),
    }))
    .sort((a, b) => b.seconds - a.seconds)[0];
  const [note, setNote] = useState(d.reviews.find((r) => r.id === week)?.note ?? '');
  const [busy, setBusy] = useState(false);
  function shift(n: number) {
    const w = addDays(week, n * 7);
    setWeek(w);
    setNote(d.reviews.find((r) => r.id === w)?.note ?? '');
  }
  return (
    <>
      <div className="toolbar">
        <h2>一周回顾</h2>
        <div className="week-control">
          <IconButton label="上一周复盘" onClick={() => shift(-1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <span>
            {week.slice(5)} – {to.slice(5)}
          </span>
          <IconButton label="下一周复盘" disabled={week >= monday()} onClick={() => shift(1)}>
            <ChevronRight size={18} />
          </IconButton>
        </div>
      </div>
      <section className="panel review-panel">
        <div className="review-number">
          <span>这一周，你专注了</span>
          <strong>{duration(total)}</strong>
          <span>
            {last
              ? `较上周${total >= last ? '增加' : '减少'} ${Math.round((Math.abs(total - last) / last) * 100)}%`
              : '上周暂无记录'}
          </span>
        </div>
        <div className="review-facts">
          <div>
            <strong>{completed}</strong>
            <span>完成任务</span>
          </div>
          <div>
            <strong>{top?.seconds ? top.name : '—'}</strong>
            <span>投入最多的课程</span>
          </div>
        </div>
        <label className="field">
          <span>复盘笔记</span>
          <textarea
            rows={5}
            placeholder="留下这一周值得记住的事。"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="form-footer">
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await db.reviews.put({ id: week, note });
                ui.notify('复盘已保存');
              } catch (e) {
                ui.notify(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            保存复盘
          </Button>
        </div>
      </section>
    </>
  );
}
