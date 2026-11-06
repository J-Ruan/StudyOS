import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Square, Volume2, VolumeX, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../lib/db';
import { useStore, useUI, go } from '../lib/context';
import { elapsedSeconds, startTimer, pauseTimer, resumeTimer, finishTimer } from '../lib/actions';
import { type Timer } from '../lib/models';
import { dailySeconds } from '../lib/logic';
import { duration, fullDate, timerText, localDate } from '../lib/time';
import { Button, IconButton, Tabs, Modal, Field, Empty } from '../components/ui';
let audio: AudioContext | undefined;
function enableSound() {
  try {
    audio ??= new AudioContext();
    void audio.resume();
  } catch {
    /* Sound is optional on restricted browsers. */
  }
}
function chime() {
  if (!audio) return;
  const osc = audio.createOscillator(),
    gain = audio.createGain();
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.15, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.8);
  osc.start();
  osc.stop(audio.currentTime + 0.8);
}
export default function Focus({ path }: { path: string }) {
  const d = useStore(),
    ui = useUI();
  const tab = path.includes('history') ? 'history' : 'timer';
  const [mode, setMode] = useState<Timer['mode']>('pomodoro'),
    [minutes, setMinutes] = useState(45),
    [courseId, setCourse] = useState(ui.focusCourse ?? ''),
    [taskId, setTask] = useState(ui.focusTask ?? ''),
    [now, setNow] = useState(Date.now()),
    [ending, setEnding] = useState(false),
    [note, setNote] = useState('');
  const t = d.timer;
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);
  const goal =
    mode === 'pomodoro'
      ? 25 * 60
      : mode === 'short'
        ? 5 * 60
        : mode === 'long'
          ? 15 * 60
          : minutes * 60;
  const elapsed = t ? elapsedSeconds(t, now) : 0;
  const remaining = t
    ? t.mode === 'stopwatch'
      ? elapsed
      : Math.max(0, t.goal - elapsed)
    : mode === 'stopwatch'
      ? 0
      : goal;
  const progress = t && t.mode !== 'stopwatch' ? Math.min(1, elapsed / t.goal) : 0;
  const todaySeconds = dailySeconds(d.sessions).get(localDate()) ?? 0;
  const perform = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (e) {
      ui.notify(String(e));
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>专注</h1>
        </div>
        <IconButton
          label={d.settings.sound ? '关闭声音' : '开启声音'}
          onClick={() => {
            enableSound();
            void db.settings.put({ ...d.settings, sound: !d.settings.sound });
          }}
        >
          {d.settings.sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
        </IconButton>
      </div>
      <Tabs
        items={[
          { value: 'timer', label: '计时器' },
          { value: 'history', label: '学习记录' },
        ]}
        value={tab}
        onChange={(v) => go(`/focus/${v}`)}
      />
      {tab === 'history' ? (
        <History />
      ) : (
        <section className="focus-page panel">
          <div className="focus-modes">
            {(['pomodoro', 'custom', 'stopwatch', 'short', 'long'] as const).map((m) => (
              <button
                key={m}
                disabled={!!t}
                className={(t?.mode ?? mode) === m ? 'active' : ''}
                onClick={() => setMode(m)}
              >
                {
                  {
                    pomodoro: '番茄专注',
                    custom: '自定义',
                    stopwatch: '正向计时',
                    short: '短休息',
                    long: '长休息',
                  }[m]
                }
              </button>
            ))}
          </div>
          {!t && mode === 'custom' && (
            <label className="custom-duration">
              <input
                aria-label="专注分钟数"
                type="number"
                min="1"
                max="1440"
                value={minutes}
                onChange={(e) => setMinutes(+e.target.value)}
              />
              分钟
            </label>
          )}
          <div
            className={`timer-dial ${t?.running ? 'running' : ''}`}
            style={{ '--progress': `${progress * 360}deg` } as React.CSSProperties}
          >
            <div>
              <span className="timer-status">
                {t
                  ? t.running
                    ? '进行中'
                    : '已暂停'
                  : mode === 'short' || mode === 'long'
                    ? '休息一下'
                    : '待开始'}
              </span>
              <output aria-label="计时" className="timer-number">
                {timerText(remaining)}
              </output>
              <span className="timer-caption">
                {t?.mode === 'stopwatch' || (!t && mode === 'stopwatch')
                  ? '正向计时'
                  : t?.mode === 'short' || t?.mode === 'long' || mode === 'short' || mode === 'long'
                    ? '休息时间'
                    : '专注时间'}
              </span>
            </div>
          </div>
          <div className="timer-associations">
            <select
              aria-label="专注课程"
              value={t?.courseId ?? courseId}
              disabled={!!t}
              onChange={(e) => {
                setCourse(e.target.value);
                setTask('');
              }}
            >
              <option value="">选择课程</option>
              {d.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="专注任务"
              value={t?.taskId ?? taskId}
              disabled={!!t}
              onChange={(e) => {
                setTask(e.target.value);
                const task = d.tasks.find((t) => t.id === e.target.value);
                if (task?.courseId) setCourse(task.courseId);
              }}
            >
              <option value="">选择任务（可选）</option>
              {d.tasks
                .filter((v) => !v.done && (!courseId || v.courseId === courseId))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.title}
                  </option>
                ))}
            </select>
          </div>
          <div className="timer-controls">
            {!t ? (
              <Button
                onClick={() => {
                  if (!Number.isFinite(goal) || goal < 60 || goal > 86400) {
                    ui.notify('时长需为 1–1440 分钟');
                    return;
                  }
                  enableSound();
                  void perform(() =>
                    startTimer(mode, goal, courseId || undefined, taskId || undefined),
                  );
                }}
              >
                <Play size={18} fill="currentColor" />
                开始专注
              </Button>
            ) : (
              <>
                <Button
                  onClick={() => {
                    enableSound();
                    void perform(() => (t.running ? pauseTimer() : resumeTimer()));
                  }}
                >
                  {t.running ? (
                    <>
                      <Pause size={19} />
                      暂停
                    </>
                  ) : (
                    <>
                      <Play size={19} />
                      继续
                    </>
                  )}
                </Button>
                <Button variant="secondary" onClick={() => setEnding(true)}>
                  <Square size={17} />
                  结束
                </Button>
              </>
            )}
          </div>
          <div className="focus-today">
            <span>今日已专注</span>
            <strong>{duration(todaySeconds)}</strong>
            <i />
            <span>
              {
                d.sessions.filter((s) =>
                  s.segments.some(
                    (seg) =>
                      localDate(seg.start) <= localDate() && localDate(seg.end) >= localDate(),
                  ),
                ).length
              }{' '}
              次
            </span>
          </div>
        </section>
      )}
      {ending && (
        <Modal title="结束本次计时" onClose={() => setEnding(false)}>
          <p className="finish-duration">
            有效专注 <strong>{duration(elapsed)}</strong>
          </p>
          <Field label="学习记录（可选）">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="这次完成了什么？"
            />
          </Field>
          <div className="form-footer">
            <Button
              variant="danger"
              onClick={() =>
                void perform(async () => {
                  await finishTimer(false, '', t?.token);
                  setEnding(false);
                  setNote('');
                  ui.notify('已放弃本次计时');
                })
              }
            >
              放弃记录
            </Button>
            <Button
              onClick={() =>
                void perform(async () => {
                  const result = await finishTimer(true, note, t?.token);
                  setEnding(false);
                  setNote('');
                  ui.notify(result?.recorded ? '学习记录已保存' : '计时已结束，休息不计入学习');
                })
              }
            >
              保存并结束
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function History() {
  const d = useStore(),
    ui = useUI();
  const [page, setPage] = useState(0),
    [course, setCourse] = useState('');
  const sessions = d.sessions
    .filter((s) => !course || s.courseId === course)
    .sort((a, b) => b.start - a.start);
  const size = 20,
    last = Math.max(0, Math.ceil(sessions.length / size) - 1),
    current = Math.min(page, last);
  return (
    <section className="panel">
      <div className="toolbar">
        <h2>
          学习记录 <span className="count">{sessions.length}</span>
        </h2>
        <select
          aria-label="记录课程"
          value={course}
          onChange={(e) => {
            setCourse(e.target.value);
            setPage(0);
          }}
        >
          <option value="">全部课程</option>
          {d.courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {sessions.slice(current * size, (current + 1) * size).map((s) => (
        <button
          className="history-row"
          key={s.id}
          onClick={() => ui.open({ kind: 'session', id: s.id })}
        >
          <span className="history-dot" />
          <div>
            <strong>{d.courses.find((c) => c.id === s.courseId)?.name ?? '自由专注'}</strong>
            <span>
              {fullDate(s.start)}
              {s.note ? ` · ${s.note}` : ''}
            </span>
          </div>
          <strong>{duration(s.seconds)}</strong>
        </button>
      ))}
      {!sessions.length && <Empty title="还没有学习记录" />}
      {sessions.length > size && (
        <div className="pagination">
          <IconButton label="上一页" disabled={current === 0} onClick={() => setPage(current - 1)}>
            <ChevronLeft size={18} />
          </IconButton>
          <span>
            {current + 1} / {last + 1}
          </span>
          <IconButton
            label="下一页"
            disabled={current === last}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
      )}
    </section>
  );
}

export function TimerRuntime() {
  const d = useStore(),
    ui = useUI(),
    finishing = useRef(false);
  useEffect(() => {
    async function check() {
      const t = d.timer;
      const now = Date.now();
      if (
        !t ||
        !t.running ||
        t.mode === 'stopwatch' ||
        elapsedSeconds(t, now) < t.goal ||
        finishing.current
      )
        return;
      finishing.current = true;
      try {
        const result = await finishTimer(true, '', t.token, now);
        if (result) {
          if (d.settings.sound) chime();
          ui.notify(result.recorded ? '专注完成，学习时间已保存' : '休息结束');
        }
      } catch (e) {
        ui.notify(String(e));
      } finally {
        finishing.current = false;
      }
    }
    const onVisibility = () => {
      if (!document.hidden) void check();
    };
    void check();
    const interval = setInterval(() => void check(), 500);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [d.timer, d.settings.sound, ui]);
  return null;
}
