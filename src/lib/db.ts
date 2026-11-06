import Dexie, { type EntityTable } from 'dexie';
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
export class StudyDB extends Dexie {
  courses!: EntityTable<Course, 'id'>;
  tasks!: EntityTable<Task, 'id'>;
  exams!: EntityTable<Exam, 'id'>;
  habits!: EntityTable<Habit, 'id'>;
  checks!: EntityTable<HabitCheck, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  settings!: EntityTable<Settings, 'id'>;
  overrides!: EntityTable<Override, 'id'>;
  timer!: EntityTable<Timer, 'id'>;
  materials!: EntityTable<Material, 'id'>;
  reviews!: EntityTable<Review, 'id'>;
  constructor(name = 'studyos') {
    super(name);
    this.version(1).stores({
      courses: 'id',
      tasks: 'id,courseId,due',
      exams: 'id,at',
      habits: 'id',
      checks: 'id,habitId,date',
      sessions: 'id,start,taskId,courseId',
      settings: 'id',
      overrides: 'id,date,courseId',
      timer: 'id',
      materials: 'id,courseId',
      reviews: 'id',
    });
    this.version(2)
      .stores({ tasks: 'id,courseId,due,&repeatKey', checks: 'id,habitId,date,[habitId+date]' })
      .upgrade(async (tx) => {
        await tx
          .table('tasks')
          .toCollection()
          .modify((t) => {
            t.repeat ??= 'none';
            t.subtasks ??= [];
            t.estimate ??= 25;
            t.notes ??= '';
            t.kind ??= 'todo';
          });
        await tx
          .table('sessions')
          .toCollection()
          .modify((s) => {
            s.segments ??= [{ start: s.start, end: s.start + s.seconds * 1000 }];
            s.note ??= '';
          });
        const checks = await tx.table('checks').toArray();
        const unique = new Map(
          checks.map((c) => [`${c.habitId}:${c.date}`, { ...c, id: `${c.habitId}:${c.date}` }]),
        );
        await tx.table('checks').clear();
        await tx.table('checks').bulkPut([...unique.values()]);
      });
  }
}
export const db = new StudyDB();
export const initialSettings: Settings = { id: 'main', theme: 'system', sound: true };
export async function getSettings() {
  return (await db.settings.get('main')) ?? initialSettings;
}
export async function resetData() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}
