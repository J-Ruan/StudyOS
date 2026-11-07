import { createContext, useContext, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, initialSettings } from './db';
import type {
  Course,
  Task,
  Exam,
  Habit,
  HabitCheck,
  Session,
  Settings,
  Override,
  Timer,
  Material,
  Review,
  StudyPlan,
} from './models';
import type { Occurrence } from './logic';
export interface Data {
  courses: Course[];
  tasks: Task[];
  exams: Exam[];
  habits: Habit[];
  checks: HabitCheck[];
  sessions: Session[];
  settings: Settings;
  overrides: Override[];
  timer?: Timer;
  materials: Material[];
  reviews: Review[];
  plans?: StudyPlan[];
}
export type Editor = {
  kind: 'course' | 'task' | 'exam' | 'habit' | 'session' | 'override';
  id?: string;
  courseId?: string;
  occurrence?: Occurrence;
};
export interface UI {
  open: (editor: Editor) => void;
  close: () => void;
  notify: (message: string) => void;
  confirm: (title: string, detail?: string) => Promise<boolean>;
  focus: (courseId?: string, taskId?: string) => void;
  focusCourse?: string;
  focusTask?: string;
}
export const UIContext = createContext<UI>(null!);
export const useUI = () => useContext(UIContext);
export function useData() {
  // Subscribe separately: a timer pause must not reread every historical session or file.
  const courses = useLiveQuery(() => db.courses.toArray(), []);
  const tasks = useLiveQuery(() => db.tasks.toArray(), []);
  const exams = useLiveQuery(() => db.exams.toArray(), []);
  const habits = useLiveQuery(() => db.habits.toArray(), []);
  const checks = useLiveQuery(() => db.checks.toArray(), []);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []);
  const settings = useLiveQuery(async () => (await db.settings.get('main')) ?? initialSettings, []);
  const overrides = useLiveQuery(() => db.overrides.toArray(), []);
  const active = useLiveQuery(async () => ({ timer: await db.timer.get('active') }), []);
  const materials = useLiveQuery(() => db.materials.toArray(), []);
  const reviews = useLiveQuery(() => db.reviews.toArray(), []);
  const plans = useLiveQuery(() => db.plans.orderBy('start').toArray(), []);
  return useMemo<Data | undefined>(
    () =>
      courses &&
      tasks &&
      exams &&
      habits &&
      checks &&
      sessions &&
      settings &&
      overrides &&
      active &&
      materials &&
      reviews &&
      plans
        ? {
            courses,
            tasks,
            exams,
            habits,
            checks,
            sessions,
            settings,
            overrides,
            timer: active.timer,
            materials,
            reviews,
            plans,
          }
        : undefined,
    [
      courses,
      tasks,
      exams,
      habits,
      checks,
      sessions,
      settings,
      overrides,
      active,
      materials,
      reviews,
      plans,
    ],
  );
}
export const DataContext = createContext<Data>(null!);
export const useStore = () => useContext(DataContext);
export function go(path: string) {
  const event = new CustomEvent('studyos:navigate', { detail: path, cancelable: true });
  if (window.dispatchEvent(event)) location.hash = path;
}
