import { useRef, useState } from 'react';
import { Circle, Check, Flag, Repeat2 } from 'lucide-react';
import type { Task } from '../lib/models';
import { priorityNames } from '../lib/models';
import { toggleTask, deleteTask } from '../lib/actions';
import { fullDate, localDate, clockTime } from '../lib/time';
import { Button, Modal } from './ui';
import { useUI, useStore } from '../lib/context';
export function TaskList({
  tasks,
  selected,
  onSelect,
}: {
  tasks: Task[];
  selected?: Set<string>;
  onSelect?: (id: string) => void;
}) {
  const [action, setAction] = useState<Task>();
  const longPress = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressed = useRef(false);
  const origin = useRef({ x: 0, y: 0 });
  const clearPress = () => {
    clearTimeout(longPress.current);
  };
  const ui = useUI();
  const { open, notify } = useUI(),
    { courses } = useStore();
  return (
    <>
      <div className="task-list">
        {tasks.map((t) => (
          <div className={`task-row ${t.done ? 'completed' : ''}`} key={t.id}>
            {onSelect && (
              <input
                type="checkbox"
                className="bulk-check"
                aria-label={`选择 ${t.title}`}
                checked={selected?.has(t.id) ?? false}
                onChange={() => onSelect(t.id)}
              />
            )}
            <button
              className="check-button"
              aria-label={`${t.done ? '重新打开' : '完成'} ${t.title}`}
              onClick={() => toggleTask(t.id).catch((e) => notify(String(e)))}
            >
              {t.done ? (
                <span className="checked">
                  <Check size={14} />
                </span>
              ) : (
                <Circle size={21} />
              )}
            </button>
            <button
              className="task-content"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                pressed.current = false;
                origin.current = { x: e.clientX, y: e.clientY };
                longPress.current = setTimeout(() => {
                  pressed.current = true;
                  setAction(t);
                }, 600);
              }}
              onPointerMove={(e) => {
                if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 12)
                  clearPress();
              }}
              onPointerUp={clearPress}
              onPointerCancel={clearPress}
              onPointerLeave={clearPress}
              onContextMenu={(e) => {
                e.preventDefault();
                clearPress();
                pressed.current = true;
                setAction(t);
              }}
              onClick={() => {
                if (pressed.current) {
                  pressed.current = false;
                  return;
                }
                open({ kind: 'task', id: t.id });
              }}
            >
              <span className="task-title">{t.title}</span>
              <span className="task-meta">
                {courses.find((c) => c.id === t.courseId)?.name && (
                  <span>{courses.find((c) => c.id === t.courseId)?.name}</span>
                )}
                <time className={!t.done && t.due < Date.now() ? 'overdue' : ''}>
                  {!t.done && t.due < Date.now()
                    ? '已逾期 · '
                    : localDate(t.due) === localDate()
                      ? '今天 · '
                      : ''}
                  {localDate(t.due) === localDate() && !(!t.done && t.due < Date.now())
                    ? clockTime(t.due)
                    : fullDate(t.due)}
                </time>
                {t.repeat !== 'none' && <Repeat2 size={13} />}
              </span>
            </button>
            <span
              className={`priority priority-${t.priority}`}
              aria-label={`${priorityNames[t.priority]}优先级`}
            >
              <Flag size={14} />
              {t.priority === 'high' && '高'}
            </span>
          </div>
        ))}
      </div>
      {action && (
        <Modal title={action.title} onClose={() => setAction(undefined)}>
          <div className="task-quick-actions">
            <Button
              variant="secondary"
              onClick={() => {
                open({ kind: 'task', id: action.id });
                setAction(undefined);
              }}
            >
              任务详情
            </Button>
            <Button
              onClick={() => {
                ui.focus(action.courseId, action.id);
                setAction(undefined);
              }}
            >
              开始专注
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                await toggleTask(action.id);
                setAction(undefined);
              }}
            >
              {action.done ? '重新打开' : '标记完成'}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (await ui.confirm('删除这个任务？', '已记录的专注时间会保留。')) {
                  await deleteTask(action.id);
                  setAction(undefined);
                }
              }}
            >
              删除任务
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
