import { z } from 'zod';
import { db, type StudyDB } from './db';
import {
  courseSchema,
  taskSchema,
  examSchema,
  habitSchema,
  checkSchema,
  sessionSchema,
  overrideSchema,
  settingsSchema,
  reviewSchema,
} from './models';
import { safeURL } from './actions';
const encodedMaterial = z
  .object({
    id: z.string().min(1).max(200),
    courseId: z.string().min(1).max(200),
    name: z.string().min(1).max(200),
    url: z.string().max(4000).optional(),
    base64: z.string().max(140000000).optional(),
    mime: z.string().max(200).optional(),
  })
  .refine(
    (m) => !!m.url !== (m.base64 !== undefined) && (!m.url || !!safeURL(m.url)),
    '资料必须包含有效的链接或文件',
  );
const list = <T extends z.ZodType>(schema: T) => z.array(schema).max(200000);
const backupSchema = z.object({
  app: z.literal('StudyOS'),
  version: z.literal(2),
  exportedAt: z.string(),
  data: z.object({
    courses: list(courseSchema),
    tasks: list(taskSchema),
    exams: list(examSchema),
    habits: list(habitSchema),
    checks: list(checkSchema),
    sessions: list(sessionSchema),
    overrides: list(overrideSchema),
    settings: list(settingsSchema),
    reviews: list(reviewSchema),
    materials: list(encodedMaterial),
  }),
});
async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
export async function exportBackup(database: StudyDB = db) {
  if (await database.timer.count()) throw Error('请先结束并保存正在进行的计时');
  const snapshot = await database.transaction('r', database.tables, async () => ({
    courses: await database.courses.toArray(),
    tasks: await database.tasks.toArray(),
    exams: await database.exams.toArray(),
    habits: await database.habits.toArray(),
    checks: await database.checks.toArray(),
    sessions: await database.sessions.toArray(),
    overrides: await database.overrides.toArray(),
    settings: await database.settings.toArray(),
    reviews: await database.reviews.toArray(),
    materials: await database.materials.toArray(),
  }));
  const materials = await Promise.all(
    snapshot.materials.map(async ({ data, ...m }) => ({
      ...m,
      ...(data ? { base64: await base64(data), mime: data.type } : {}),
    })),
  );
  return JSON.stringify({
    app: 'StudyOS',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: { ...snapshot, materials },
  });
}
export function parseBackup(raw: string) {
  if (raw.length > 150000000) throw Error('备份超过 150 MB，请分开保存较大的资料文件');
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error('不是有效的 JSON 文件');
  }
  // v1 exports used scalar focus durations. Convert them before validating v2.
  if (value?.app === 'StudyOS' && value.version === 1 && value.data) {
    value.version = 2;
    value.data.materials ??= [];
    value.data.reviews ??= [];
    value.data.overrides ??= [];
    value.data.checks ??= [];
    value.data.settings ??= [];
    for (const t of value.data.tasks ?? []) {
      t.repeat ??= 'none';
      t.subtasks ??= [];
      t.notes ??= '';
      t.estimate ??= 25;
      t.kind ??= 'todo';
    }
    for (const s of value.data.sessions ?? []) {
      s.segments ??= [{ start: s.start, end: s.start + s.seconds * 1000 }];
      s.note ??= '';
    }
  }
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success)
    throw Error(
      `备份格式不合法：${parsed.error.issues[0].path.join('.')} ${parsed.error.issues[0].message}`,
    );
  for (const rows of Object.values(parsed.data.data)) {
    const ids = new Set<string>();
    for (const row of rows) {
      if (ids.has(row.id)) throw Error('备份包含重复编号');
      ids.add(row.id);
    }
  }
  const checkKeys = new Set<string>();
  for (const c of parsed.data.data.checks) {
    const k = `${c.habitId}:${c.date}`;
    if (checkKeys.has(k)) throw Error('备份包含重复打卡');
    checkKeys.add(k);
  }
  const repeatKeys = new Set<string>();
  for (const t of parsed.data.data.tasks)
    if (t.repeatKey) {
      if (repeatKeys.has(t.repeatKey)) throw Error('备份包含重复循环任务');
      repeatKeys.add(t.repeatKey);
    }
  return parsed.data;
}
export async function importBackup(raw: string, mode: 'merge' | 'replace', database: StudyDB = db) {
  const backup = parseBackup(raw);
  backup.data.checks = backup.data.checks.map((c) => ({ ...c, id: `${c.habitId}:${c.date}` }));
  const materials = backup.data.materials.map(({ base64, mime, ...m }) => ({
    ...m,
    ...(base64 !== undefined
      ? {
          data: new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], {
            type: mime ?? 'application/octet-stream',
          }),
        }
      : {}),
  }));
  await database.transaction('rw', database.tables, async () => {
    if (await database.timer.count()) throw Error('请先结束当前计时，再恢复备份');
    if (mode === 'replace') for (const table of database.tables) await table.clear();
    for (const [name, rows] of Object.entries({ ...backup.data, materials })) {
      const table = database.table(name);
      if (mode === 'replace') await table.bulkPut(rows);
      else {
        const existing = new Set((await table.toCollection().primaryKeys()).map(String));
        let fresh = rows.filter((r) => !existing.has(r.id));
        if (name === 'tasks') {
          const keys = new Set((await database.tasks.toArray()).map((t) => t.repeatKey));
          fresh = fresh.filter(
            (r) => !('repeatKey' in r) || !r.repeatKey || !keys.has(r.repeatKey),
          );
        }
        if (name === 'checks') {
          const keys = new Set(
            (await database.checks.toArray()).map((c) => `${c.habitId}:${c.date}`),
          );
          fresh = fresh.filter(
            (r) => !('habitId' in r) || !('date' in r) || !keys.has(`${r.habitId}:${r.date}`),
          );
        }
        await table.bulkAdd(fresh);
      }
    }
  });
  return backup;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
