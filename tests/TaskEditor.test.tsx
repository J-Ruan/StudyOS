import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Editors } from '../src/components/Editors';
import { TaskList } from '../src/components/TaskList';
import { UIContext, DataContext, type Data, type UI } from '../src/lib/context';
import { db, resetData, initialSettings } from '../src/lib/db';
import { taskSchema } from '../src/lib/models';
const data: Data = {
  courses: [],
  tasks: [],
  exams: [],
  habits: [],
  checks: [],
  sessions: [],
  overrides: [],
  materials: [],
  reviews: [],
  plans: [],
  settings: initialSettings,
};
const ui: UI = {
  open: vi.fn(),
  close: vi.fn(),
  notify: vi.fn(),
  confirm: vi.fn().mockResolvedValue(true),
  focus: vi.fn(),
};
const mount = (child: React.ReactNode, d = data) =>
  render(
    <UIContext.Provider value={ui}>
      <DataContext.Provider value={d}>{child}</DataContext.Provider>
    </UIContext.Provider>,
  );
beforeEach(async () => {
  await resetData();
  vi.clearAllMocks();
});
afterEach(() => cleanup());
it('quick creation shows only name/deadline, saves immediately without repeat submissions', async () => {
  mount(<Editors editor={{ kind: 'task' }} />);
  expect(screen.getByLabelText('优先级')).not.toBeVisible();
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '写作业' } });
  const save = screen.getByRole('button', { name: '保存' });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(async () => expect(await db.tasks.count()).toBe(1));
  expect((await db.tasks.toArray())[0]).toMatchObject({
    title: '写作业',
    priority: 'medium',
    estimate: 25,
    repeat: 'none',
  });
});
it('editing retains advanced fields and changes real data', async () => {
  const t = taskSchema.parse({
    id: 't',
    title: '修改我',
    kind: 'todo',
    notes: '',
    due: Date.now() + 86400000,
    priority: 'medium',
    estimate: 25,
    done: false,
    subtasks: [],
    repeat: 'none',
  });
  await db.tasks.add(t);
  mount(<Editors editor={{ kind: 'task', id: 't' }} />, { ...data, tasks: [t] });
  fireEvent.change(screen.getByLabelText('优先级'), { target: { value: 'high' } });
  fireEvent.change(screen.getByLabelText('任务标题'), { target: { value: '已修改' } });
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(async () => expect((await db.tasks.get('t'))?.title).toBe('已修改'));
  expect((await db.tasks.get('t'))?.priority).toBe('high');
});
it('long-press menu focus links the task', async () => {
  const t = taskSchema.parse({
    id: 't',
    title: '快捷任务',
    kind: 'todo',
    notes: '',
    due: Date.now() + 86400000,
    priority: 'medium',
    estimate: 25,
    done: false,
    subtasks: [],
    repeat: 'none',
  });
  await db.tasks.add(t);
  mount(<TaskList tasks={[t]} />, { ...data, tasks: [t] });
  fireEvent.contextMenu(document.querySelector('.task-content')!);
  fireEvent.click(screen.getByRole('button', { name: '开始专注' }));
  expect(ui.focus).toHaveBeenCalledWith(undefined, 't');
});

it('task detail cancellation updates migrated study plans only after saving', async () => {
  const at = Date.now() + 3600000;
  const t = taskSchema.parse({
    id: 'linked',
    title: '已排任务',
    kind: 'todo',
    notes: '',
    due: at + 86400000,
    priority: 'medium',
    estimate: 25,
    done: false,
    subtasks: [],
    repeat: 'none',
    scheduledStart: at,
    scheduledEnd: at + 1500000,
  });
  const plan = {
    id: 'legacy:linked',
    taskId: 'linked',
    title: t.title,
    start: at,
    end: at + 1500000,
    done: false,
  };
  await db.tasks.add(t);
  await db.plans.add(plan);
  mount(<Editors editor={{ kind: 'task', id: t.id }} />, { ...data, tasks: [t], plans: [plan] });
  fireEvent.click(screen.getByRole('button', { name: '取消安排' }));
  expect(await db.plans.count()).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: '保存' }));
  await waitFor(async () => expect(await db.plans.count()).toBe(0));
  expect((await db.tasks.get(t.id))?.scheduledStart).toBeUndefined();
});
