import { db } from './db';
import { id, defaultPeriods, type Course, type Session } from './models';
import { addDays, atTime, localDate, monday, weekday } from './time';
export async function addDemo() {
  await db.transaction('rw', db.tables, async () => {
    if (
      (await db.courses.count()) ||
      (await db.tasks.count()) ||
      (await db.sessions.count()) ||
      (await db.habits.count()) ||
      (await db.exams.count())
    )
      throw Error('已有学习数据，不能添加示例');
    const today = localDate(),
      start = addDays(monday(today), -28);
    const courses: Course[] = [
      ['高等数学', '陈老师', '教学楼 A203', '#ad83c4'],
      ['大学英语', '林老师', '文科楼 B102', '#b47e9b'],
      ['数据结构', '周老师', '实验楼 301', '#8499b6'],
      ['线性代数', '王老师', '教学楼 A305', '#7e9b93'],
    ].map(([name, teacher, room, color], i) => ({
      id: id(),
      name,
      teacher,
      room,
      color,
      slots: [
        {
          id: id(),
          day: weekday(today),
          start: i * 2 + 1,
          end: i * 2 + 2,
          from: 1,
          to: 16,
          parity: 'all',
        },
        {
          id: id(),
          day: ((weekday(today) + 1) % 7) + 1,
          start: i * 2 + 1,
          end: i * 2 + 2,
          from: 1,
          to: 16,
          parity: i === 3 ? 'odd' : 'all',
        },
      ],
    }));
    await db.courses.bulkAdd(courses);
    await db.settings.put({
      id: 'main',
      theme: 'system',
      sound: true,
      semester: {
        name: '秋季学期',
        start,
        end: addDays(start, 111),
        weeks: 16,
        periods: defaultPeriods,
      },
    });
    await db.tasks.bulkAdd([
      {
        id: id(),
        title: '完成第三章习题',
        courseId: courses[0].id,
        kind: 'assignment',
        notes: '',
        due: atTime(today, '23:59'),
        priority: 'high',
        estimate: 45,
        done: false,
        subtasks: [],
        repeat: 'none',
      },
      {
        id: id(),
        title: '阅读与整理英文文献',
        courseId: courses[1].id,
        kind: 'study',
        notes: '',
        due: atTime(today, '23:59'),
        priority: 'medium',
        estimate: 30,
        done: false,
        subtasks: [],
        repeat: 'none',
      },
      {
        id: id(),
        title: '复习二叉树的遍历',
        courseId: courses[2].id,
        kind: 'review',
        notes: '',
        due: atTime(today, '23:59'),
        priority: 'medium',
        estimate: 25,
        done: false,
        subtasks: [],
        repeat: 'none',
      },
      {
        id: id(),
        title: '整理本周课堂笔记',
        courseId: courses[3].id,
        kind: 'todo',
        notes: '',
        due: atTime(addDays(today, 1), '18:00'),
        priority: 'low',
        estimate: 30,
        done: false,
        subtasks: [],
        repeat: 'weekly',
      },
    ]);
    await db.exams.add({
      id: id(),
      name: '高等数学 · 期中考试',
      kind: 'final',
      at: atTime(addDays(today, 12), '09:00'),
      room: '教学楼 A203',
      courseId: courses[0].id,
      notes: '',
      taskIds: [],
      archived: false,
    });
    const sessions: Session[] = [];
    for (let n = 0; n < 21; n++) {
      const end = Date.now() - n * 86400000 - 3600000;
      const seconds = (25 + ((n * 17) % 100)) * 60;
      const begin = end - seconds * 1000;
      sessions.push({
        id: id(),
        start: begin,
        end,
        seconds,
        segments: [{ start: begin, end }],
        courseId: courses[n % 4].id,
        note: '',
      });
    }
    await db.sessions.bulkAdd(sessions);
    await db.habits.add({
      id: id(),
      name: '每日阅读',
      kind: 'minutes',
      target: 20,
      days: [1, 2, 3, 4, 5, 6, 7],
      created: addDays(today, -7),
    });
  });
}
