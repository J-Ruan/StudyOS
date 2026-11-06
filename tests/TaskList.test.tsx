import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DataContext, UIContext, type Data, type UI } from '../src/lib/context';
import { TaskList } from '../src/components/TaskList';
import { db, initialSettings, resetData } from '../src/lib/db';
import type { Task } from '../src/lib/models';
afterEach(async () => {
  cleanup();
  await resetData();
});
it('通过可访问的任务按钮打开详情，并真正写入完成状态', async () => {
  const task: Task = {
    id: 'ui-task',
    title: '高数练习',
    kind: 'assignment',
    notes: '',
    due: Date.now() - 1000,
    priority: 'high',
    estimate: 25,
    done: false,
    subtasks: [],
    repeat: 'none',
  };
  await db.tasks.put(task);
  const open = vi.fn();
  const data: Data = {
    courses: [],
    tasks: [task],
    exams: [],
    habits: [],
    checks: [],
    sessions: [],
    settings: initialSettings,
    overrides: [],
    materials: [],
    reviews: [],
  };
  const ui: UI = { open, close: vi.fn(), notify: vi.fn(), confirm: vi.fn(), focus: vi.fn() };
  render(
    <UIContext.Provider value={ui}>
      <DataContext.Provider value={data}>
        <TaskList tasks={[task]} />
      </DataContext.Provider>
    </UIContext.Provider>,
  );
  expect(screen.getByText(/已逾期/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /高数练习 已逾期/ }));
  expect(open).toHaveBeenCalledWith({ kind: 'task', id: 'ui-task' });
  fireEvent.click(screen.getByRole('button', { name: '完成 高数练习' }));
  await waitFor(async () => expect((await db.tasks.get('ui-task'))?.done).toBe(true));
});
