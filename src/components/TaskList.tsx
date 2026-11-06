import { Circle, Check, Flag, Repeat2 } from 'lucide-react';
import type { Task } from '../lib/models';
import { priorityNames } from '../lib/models';
import { toggleTask } from '../lib/actions';
import { fullDate, localDate } from '../lib/time';
import { useUI, useStore } from '../lib/context';
export function TaskList({ tasks }: { tasks: Task[] }) {
  const { open, notify } = useUI(),
    { courses } = useStore();
  return (
    <div className="task-list">
      {tasks.map((t) => (
        <div className={`task-row ${t.done ? 'completed' : ''}`} key={t.id}>
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
          <button className="task-content" onClick={() => open({ kind: 'task', id: t.id })}>
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
                {fullDate(t.due)}
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
  );
}
