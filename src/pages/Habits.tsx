import { useState } from 'react';
import { Check, Plus, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { db } from '../lib/db';
import { useStore, useUI } from '../lib/context';
import { habitStats } from '../lib/logic';
import { localDate, addDays, weekday, parseDate } from '../lib/time';
import { weekdays, type Habit } from '../lib/models';
import { Button, IconButton, Empty, Modal, SaveForm, Field } from '../components/ui';
export default function Habits() {
  const d = useStore(),
    ui = useUI();
  const [date, setDate] = useState(localDate()),
    [editing, setEditing] = useState<Habit>(),
    [value, setValue] = useState('1'),
    [month, setMonth] = useState(localDate().slice(0, 7));
  const monthDays = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
  async function check(h: Habit) {
    const existing = d.checks.find((c) => c.habitId === h.id && c.date === date);
    if (h.kind === 'check') {
      await db.checks.put({
        id: `${h.id}:${date}`,
        habitId: h.id,
        date,
        value: existing?.value ? 0 : 1,
      });
    } else {
      setEditing(h);
      setValue(String(existing?.value ?? 0));
    }
  }
  function changeMonth(n: number) {
    const day = parseDate(`${month}-01`);
    day.setMonth(day.getMonth() + n);
    setMonth(localDate(day).slice(0, 7));
  }
  return (
    <>
      <div className="toolbar">
        <div className="week-control">
          <IconButton label="前一天" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft size={18} />
          </IconButton>
          <input
            type="date"
            aria-label="打卡日期"
            value={date}
            max={localDate()}
            onChange={(e) => setDate(e.target.value)}
          />
          <IconButton
            label="后一天"
            disabled={date >= localDate()}
            onClick={() => setDate(addDays(date, 1))}
          >
            <ChevronRight size={18} />
          </IconButton>
        </div>
        <Button onClick={() => ui.open({ kind: 'habit' })}>
          <Plus size={16} />
          新建习惯
        </Button>
      </div>
      <div className="habit-grid">
        {d.habits.map((h) => {
          const stats = habitStats(h, d.checks),
            checked = d.checks.find((c) => c.habitId === h.id && c.date === date)?.value ?? 0,
            rest = !h.days.includes(weekday(date));
          return (
            <article className="panel habit-card" key={h.id}>
              <div className="section-title">
                <h2>{h.name}</h2>
                <IconButton
                  label={`编辑 ${h.name}`}
                  onClick={() => ui.open({ kind: 'habit', id: h.id })}
                >
                  <Pencil size={17} />
                </IconButton>
              </div>
              <div className="habit-today">
                <div>
                  <strong>
                    {h.kind === 'check' ? (checked >= h.target ? '已完成' : '待完成') : checked}
                    <small>
                      {h.kind === 'minutes'
                        ? ` / ${h.target} 分钟`
                        : h.kind === 'count'
                          ? ` / ${h.target} 次`
                          : ''}
                    </small>
                  </strong>
                  <span className="muted">
                    {rest ? '休息日' : `周${h.days.map((day) => weekdays[day - 1]).join('、')}`}
                  </span>
                </div>
                <Button
                  variant={checked >= h.target ? 'secondary' : 'primary'}
                  disabled={date < h.created || date > localDate()}
                  onClick={() => check(h)}
                >
                  {checked >= h.target ? <Check size={18} /> : <Plus size={18} />}
                  {h.kind === 'check' ? (checked ? '撤销' : '打卡') : '记录'}
                </Button>
              </div>
              <div className="habit-summary">
                <span>
                  完成率 <b>{stats.rate}%</b>
                </span>
                <span>
                  连续完成 <b>{stats.streak} 天</b>
                </span>
              </div>
              <div className="habit-week">
                {Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)).map((day) => (
                  <button
                    key={day}
                    title={day}
                    aria-label={`查看 ${day}`}
                    className={
                      (d.checks.find((c) => c.habitId === h.id && c.date === day)?.value ?? 0) >=
                      h.target
                        ? 'filled'
                        : ''
                    }
                    onClick={() => setDate(day)}
                  >
                    {weekdays[weekday(day) - 1]}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      {!d.habits.length && (
        <section className="panel">
          <Empty
            title="给喜欢的事情留一点时间"
            action="新建习惯"
            onAction={() => ui.open({ kind: 'habit' })}
          />
        </section>
      )}
      {!!d.habits.length && (
        <section className="panel habit-calendar">
          <div className="section-title">
            <h2>打卡日历</h2>
            <div className="week-control">
              <IconButton label="上一月" onClick={() => changeMonth(-1)}>
                <ChevronLeft size={18} />
              </IconButton>
              <span>{month.replace('-', ' 年 ')} 月</span>
              <IconButton
                label="下一月"
                disabled={month >= localDate().slice(0, 7)}
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={18} />
              </IconButton>
            </div>
          </div>
          <div className="calendar-grid">
            {weekdays.map((w) => (
              <span key={w} className="calendar-weekday">
                {w}
              </span>
            ))}
            {Array.from({ length: weekday(`${month}-01`) - 1 }, (_, i) => (
              <span key={`pad${i}`} />
            ))}
            {Array.from({ length: monthDays }, (_, i) => {
              const day = `${month}-${String(i + 1).padStart(2, '0')}`;
              const done = d.habits.filter(
                (h) =>
                  (d.checks.find((c) => c.habitId === h.id && c.date === day)?.value ?? 0) >=
                  h.target,
              ).length;
              return (
                <button
                  disabled={day > localDate()}
                  key={day}
                  className={`${date === day ? 'selected-date' : ''} ${done ? 'has-check' : ''}`}
                  onClick={() => setDate(day)}
                >
                  {i + 1}
                  {done > 0 && <span>{done} 项</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}
      {editing && (
        <Modal title={`${editing.name} · ${date}`} onClose={() => setEditing(undefined)}>
          <SaveForm
            onSave={async () => {
              const n = Number(value);
              if (!Number.isFinite(n) || n < 0 || n > 100000)
                throw Error('请输入 0–100000 之间的数值');
              await db.checks.put({
                id: `${editing.id}:${date}`,
                habitId: editing.id,
                date,
                value: n,
              });
              setEditing(undefined);
              ui.notify('打卡已更新');
            }}
          >
            <Field label={editing.kind === 'minutes' ? '分钟数' : '完成次数'}>
              <input
                type="number"
                required
                min="0"
                max="100000"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </Field>
          </SaveForm>
        </Modal>
      )}
    </>
  );
}
