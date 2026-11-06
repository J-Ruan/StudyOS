import { createContext, useContext } from 'react';
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
  return useLiveQuery(
    async (): Promise<Data> => ({
      courses: await db.courses.toArray(),
      tasks: await db.tasks.toArray(),
      exams: await db.exams.toArray(),
      habits: await db.habits.toArray(),
      checks: await db.checks.toArray(),
      sessions: await db.sessions.toArray(),
      settings: (await db.settings.get('main')) ?? initialSettings,
      overrides: await db.overrides.toArray(),
      timer: await db.timer.get('active'),
      materials: await db.materials.toArray(),
      reviews: await db.reviews.toArray(),
    }),
    [],
  );
}
export const DataContext = createContext<Data>(null!);
export const useStore = () => useContext(DataContext);
export function go(path: string) {
  location.hash = path;
}
