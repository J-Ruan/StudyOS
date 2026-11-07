import { courseSchema, id, type Course, type Settings } from './models';
import { db, type StudyDB } from './db';

export const importFields = [
  'name',
  'teacher',
  'room',
  'day',
  'start',
  'end',
  'from',
  'to',
  'parity',
] as const;
export type ImportField = (typeof importFields)[number];
export type Mapping = Record<ImportField, number>;
export const fieldLabels: Record<ImportField, string> = {
  name: '课程名称',
  teacher: '任课教师',
  room: '教室',
  day: '星期',
  start: '开始节次',
  end: '结束节次',
  from: '起始教学周',
  to: '结束教学周',
  parity: '单双周规则',
};
const aliases: Record<ImportField, string[]> = {
  name: ['课程名称', '课程名', '课程', 'name', 'coursename'],
  teacher: ['任课教师', '教师', '老师', 'teacher'],
  room: ['教室', '上课地点', '地点', 'room'],
  day: ['星期', '星期几', '周几', 'day', 'weekday'],
  start: ['开始节次', '起始节次', '开始节', 'start'],
  end: ['结束节次', '结束节', 'end'],
  from: ['起始教学周', '开始周', '起始周', 'from'],
  to: ['结束教学周', '结束周', 'to'],
  parity: ['单双周规则', '单双周', '重复', 'parity'],
};
export function parseCSV(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || !cell) quoted = !quoted;
      else throw Error('CSV 引号格式错误');
    } else if (c === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('CSV 存在未闭合引号');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (rows.length > 2001 || rows.some((r) => r.length > 100))
    throw Error('最多导入 2000 行、100 列');
  return rows;
}
export async function readCourseFile(file: File): Promise<string[][]> {
  if (file.size > 5 * 1024 * 1024) throw Error('课表文件不能超过 5 MB');
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw Error('请选择 CSV 或 XLSX 文件');
  const { default: readXlsxFile } = await import('read-excel-file');
  const rows = await readXlsxFile(await file.arrayBuffer());
  if (rows.length > 2001 || rows.some((r) => r.length > 100))
    throw Error('最多导入 2000 行、100 列');
  return rows.map((row) => row.map((value) => (value === null ? '' : String(value))));
}
export function guessMapping(headers: string[]): Mapping {
  return Object.fromEntries(
    importFields.map((field) => [
      field,
      headers.findIndex((h) => aliases[field].includes(h.replace(/\s/g, '').toLowerCase())),
    ]),
  ) as Mapping;
}
const normalized = (c: Course) =>
  `${c.name.trim().toLowerCase()}\0${c.teacher.trim().toLowerCase()}\0${c.room.trim().toLowerCase()}`;
const slotKey = (slot: Course['slots'][number]) =>
  [slot.day, slot.start, slot.end, slot.from, slot.to, slot.parity].join(':');
export function coursesConflict(a: Course, b: Course) {
  return a.slots.some((x) =>
    b.slots.some((y) => {
      if (x.day !== y.day || x.start > y.end || y.start > x.end) return false;
      for (let w = Math.max(x.from, y.from); w <= Math.min(x.to, y.to); w++)
        if (
          (x.parity === 'all' || (w % 2 === 1) === (x.parity === 'odd')) &&
          (y.parity === 'all' || (w % 2 === 1) === (y.parity === 'odd'))
        )
          return true;
      return false;
    }),
  );
}
export function previewCourses(
  rows: string[][],
  mapping: Mapping,
  existing: Course[],
  semester: Settings['semester'],
  mode: 'skip' | 'merge' = 'merge',
  skipConflicts = false,
) {
  if (!semester) throw Error('请先设置学期与每日节次');
  if (!rows.length || rows.length > 2000) throw Error('文件没有课程数据或超过 2000 行');
  for (const field of ['name', 'day', 'start', 'end'] as const)
    if (mapping[field] < 0) throw Error(`请映射「${fieldLabels[field]}」`);
  const working = new Map(existing.map((c) => [c.id, { ...c, slots: [...c.slots] }]));
  const changes = new Map<string, Course>();
  const messages: string[] = [];
  let skipped = 0,
    conflicts = 0,
    duplicates = 0;
  const incoming = new Map<string, Course>();
  for (const [i, row] of rows.entries()) {
    const get = (field: ImportField, fallback = '') => row[mapping[field]]?.trim() || fallback;
    const rawDay = get('day').replace(/^(星期|周)/, '');
    const day =
      Number(rawDay) ||
      ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 } as Record<string, number>)[
        rawDay
      ];
    const parity = (
      {
        '': 'all',
        每周: 'all',
        全部: 'all',
        all: 'all',
        单周: 'odd',
        单: 'odd',
        odd: 'odd',
        双周: 'even',
        双: 'even',
        even: 'even',
      } as const
    )[get('parity') as ''];
    const parsed = courseSchema.safeParse({
      id: id(),
      name: get('name'),
      teacher: get('teacher'),
      room: get('room'),
      color: '#a47bbe',
      slots: [
        {
          id: id(),
          day,
          start: Number(get('start')),
          end: Number(get('end')),
          from: Number(get('from', '1')),
          to: Number(get('to', String(semester.weeks))),
          parity: parity ?? 'invalid',
        },
      ],
    });
    if (!parsed.success) {
      messages.push(`第 ${i + 2} 行：${parsed.error.issues[0].message}`);
      continue;
    }
    const c = parsed.data;
    if (c.slots[0].end > semester.periods.length || c.slots[0].to > semester.weeks) {
      messages.push(`第 ${i + 2} 行：节次或教学周超出学期设置`);
      continue;
    }
    const group = incoming.get(normalized(c));
    if (group) {
      if (group.slots.some((s) => slotKey(s) === slotKey(c.slots[0]))) {
        skipped++;
        duplicates++;
      } else group.slots.push(c.slots[0]);
    } else incoming.set(normalized(c), c);
  }
  for (const c of incoming.values()) {
    const match = [...working.values()].find((e) => normalized(e) === normalized(c));
    if (match && mode === 'skip') {
      skipped++;
      duplicates++;
      continue;
    }
    const fresh = match
      ? c.slots.filter((s) => !match.slots.some((t) => slotKey(s) === slotKey(t)))
      : c.slots;
    if (!fresh.length) {
      skipped++;
      duplicates++;
      continue;
    }
    const candidate = match ? { ...match, slots: [...match.slots, ...fresh] } : c;
    const hasConflict =
      [...working.values()].some(
        (e) => e.id !== match?.id && coursesConflict({ ...candidate, slots: fresh }, e),
      ) ||
      fresh.some((s) =>
        candidate.slots.some(
          (t) => t.id !== s.id && coursesConflict({ ...c, slots: [s] }, { ...c, slots: [t] }),
        ),
      );
    if (hasConflict) {
      conflicts++;
      if (skipConflicts) {
        skipped++;
        continue;
      }
    }
    courseSchema.parse(candidate);
    working.set(candidate.id, candidate);
    changes.set(candidate.id, candidate);
  }
  return {
    courses: [...changes.values()],
    added: [...changes.keys()].filter((k) => !existing.some((c) => c.id === k)).length,
    merged: [...changes.keys()].filter((k) => existing.some((c) => c.id === k)).length,
    skipped,
    duplicates,
    conflicts,
    errors: messages,
  };
}
export async function importCourses(
  rows: string[][],
  mapping: Mapping,
  mode: 'skip' | 'merge',
  skipConflicts: boolean,
  database: StudyDB = db,
) {
  return database.transaction('rw', [database.courses, database.settings], async () => {
    const preview = previewCourses(
      rows,
      mapping,
      await database.courses.toArray(),
      (await database.settings.get('main'))?.semester,
      mode,
      skipConflicts,
    );
    if (preview.errors.length) throw Error(preview.errors[0]);
    if (preview.conflicts && !skipConflicts) throw Error('仍有时间冲突，请调整文件或选择跳过冲突');
    await database.courses.bulkPut(preview.courses);
    return preview;
  });
}
