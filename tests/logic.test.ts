import { describe, expect, it } from 'vitest';
import {
  occurrences,
  teachingWeek,
  freeSlots,
  overlaps,
  sortTasks,
  dailySeconds,
  rangeSeconds,
  habitStats,
} from '../src/lib/logic';
import {
  localDate,
  addDays,
  daysBetween,
  atTime,
  nextDue,
  examDays,
  monday,
} from '../src/lib/time';
import {
  defaultPeriods,
  type Course,
  type Settings,
  type Task,
  type Session,
} from '../src/lib/models';
const semester: Settings['semester'] = {
  name: '春季',
  start: '2026-03-04',
  end: '2026-06-30',
  weeks: 16,
  periods: defaultPeriods,
};
const course: Course = {
  id: 'c',
  name: '高数',
  teacher: '',
  room: 'A101',
  color: '#ad83c4',
  slots: [{ id: 's', day: 3, start: 1, end: 3, from: 1, to: 16, parity: 'odd' }],
};
const task = (patch: Partial<Task> = {}): Task => ({
  id: 't',
  title: '练习',
  kind: 'assignment',
  notes: '',
  due: atTime('2026-03-04', '23:00'),
  priority: 'medium',
  estimate: 30,
  done: false,
  subtasks: [],
  repeat: 'none',
  ...patch,
});
function session(start: number, end: number): Session {
  return {
    id: 'r',
    start,
    end,
    seconds: (end - start) / 1000,
    segments: [{ start, end }],
    note: '',
  };
}
describe('课程与自习时间', () => {
  it('非周一起始的学期仍按自然周计算教学周', () => {
    expect(teachingWeek('2026-03-04', semester)).toBe(1);
    expect(teachingWeek('2026-03-09', semester)).toBe(2);
    expect(teachingWeek('2026-03-01', semester)).toBe(0);
  });
  it('正确显示单周、双周和跨节次课程', () => {
    const a = occurrences('2026-03-04', [course], [], semester);
    expect(a).toHaveLength(1);
    expect(a[0].endAt).toBe(atTime('2026-03-04', '10:45'));
    expect(occurrences('2026-03-11', [course], [], semester)).toHaveLength(0);
    expect(
      occurrences(
        '2026-03-11',
        [{ ...course, slots: [{ ...course.slots[0], parity: 'even' }] }],
        [],
        semester,
      ),
    ).toHaveLength(1);
  });
  it('限制教学周、学期开始和结束', () => {
    expect(occurrences('2026-02-25', [course], [], semester)).toEqual([]);
    expect(occurrences('2026-07-01', [course], [], semester)).toEqual([]);
    expect(
      occurrences(
        '2026-03-18',
        [{ ...course, slots: [{ ...course.slots[0], to: 1 }] }],
        [],
        semester,
      ),
    ).toEqual([]);
  });
  it('停课不改变循环原课表', () => {
    const cancel = {
      id: 'o',
      date: '2026-03-04',
      courseId: 'c',
      slotId: 's',
      kind: 'cancel' as const,
      start: 1,
      end: 3,
      room: '',
    };
    expect(occurrences(cancel.date, [course], [cancel], semester)).toEqual([]);
    expect(occurrences('2026-03-18', [course], [cancel], semester)).toHaveLength(1);
    expect(course.slots[0].day).toBe(3);
  });
  it('调课只移动一次，支持移到不同教学周', () => {
    const move = {
      id: 'o',
      date: '2026-03-04',
      courseId: 'c',
      slotId: 's',
      kind: 'move' as const,
      start: 5,
      end: 6,
      room: 'B201',
      targetDate: '2026-03-12',
    };
    expect(occurrences(move.date, [course], [move], semester)).toEqual([]);
    const moved = occurrences(move.targetDate, [course], [move], semester);
    expect(moved[0].room).toBe('B201');
    expect(moved[0].start).toBe(5);
    expect(occurrences('2026-03-18', [course], [move], semester)).toHaveLength(1);
  });
  it('临时加课独立于单双周限制', () => {
    expect(
      occurrences(
        '2026-03-05',
        [course],
        [{ id: 'o', date: '2026-03-05', courseId: 'c', kind: 'extra', start: 7, end: 8, room: '' }],
        semester,
      ),
    ).toHaveLength(1);
  });
  it('时间冲突按区间相交计算，首尾相接不冲突', () => {
    expect(overlaps({ startAt: 1, endAt: 4 }, { startAt: 2, endAt: 3 })).toBe(true);
    expect(overlaps({ startAt: 1, endAt: 2 }, { startAt: 2, endAt: 3 })).toBe(false);
  });
  it('合并相交课程、任务和考试，输出至少半小时的空闲', () => {
    const lessons = occurrences('2026-03-04', [course], [], semester);
    const blocks = freeSlots('2026-03-04', lessons, [
      task({
        scheduledStart: atTime('2026-03-04', '10:00'),
        scheduledEnd: atTime('2026-03-04', '12:00'),
      }),
    ]);
    expect(blocks[0]).toEqual({
      startAt: atTime('2026-03-04', '12:00'),
      endAt: atTime('2026-03-04', '22:00'),
    });
  });
  it('未设置学期安全返回空课程', () =>
    expect(occurrences('2026-03-04', [course], [], undefined)).toEqual([]));
});
describe('日期和任务', () => {
  it('日期加减不会产生 UTC 日期偏移', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(monday('2026-11-08')).toBe('2026-11-02');
  });
  it('重复任务保留本地时间，月末收敛到当月最后一天', () => {
    expect(localDate(nextDue(atTime('2026-01-31', '18:30'), 'monthly'))).toBe('2026-02-28');
    expect(nextDue(atTime('2026-03-04', '18:30'), 'weekly')).toBe(atTime('2026-03-11', '18:30'));
  });
  it('考试当天为零天，昨天为负一天', () => {
    const now = atTime('2026-03-04', '09:00');
    expect(examDays(atTime('2026-03-04', '18:00'), now)).toBe(0);
    expect(examDays(atTime('2026-03-03', '23:59'), now)).toBe(-1);
  });
  it('优先级优先，同级按截止时间排序', () => {
    expect(
      sortTasks([
        task({ id: 'low', priority: 'low' }),
        task({ id: 'hi', priority: 'high', due: 9999999999999 }),
        task({ id: 'early', priority: 'high' }),
      ]).map((t) => t.id),
    ).toEqual(['early', 'hi', 'low']);
  });
});
describe('真实时长统计与习惯', () => {
  it('跨午夜专注正确拆分到两天', () => {
    const s = session(atTime('2026-03-04', '23:30'), atTime('2026-03-05', '00:30'));
    const totals = dailySeconds([s]);
    expect(totals.get('2026-03-04')).toBe(1800);
    expect(totals.get('2026-03-05')).toBe(1800);
    expect(rangeSeconds([s], '2026-03-04', '2026-03-04')).toBe(1800);
  });
  it('暂停区间不计入统计', () => {
    const s = session(atTime('2026-03-04', '10:00'), atTime('2026-03-04', '11:00'));
    s.seconds = 1200;
    s.segments = [
      { start: s.start, end: s.start + 600000 },
      { start: s.end - 600000, end: s.end },
    ];
    expect(dailySeconds([s]).get('2026-03-04')).toBe(1200);
  });
  it('大量历史仍只累计有效记录，不计页面打开时间', () => {
    const sessions = Array.from({ length: 10000 }, (_, i) => ({
      ...session(atTime('2026-03-04', '10:00'), atTime('2026-03-04', '10:25')),
      id: `s${i}`,
    }));
    expect(dailySeconds(sessions).get('2026-03-04')).toBe(15000000);
    expect(dailySeconds([]).size).toBe(0);
  });
  it('休息日不打断连续完成，未完成今天不提前清零', () => {
    const h = {
      id: 'h',
      name: '阅读',
      kind: 'check' as const,
      target: 1,
      days: [1, 2, 3, 4, 5],
      created: '2026-03-06',
    };
    const checks = [{ id: 'a', habitId: 'h', date: '2026-03-06', value: 1 }];
    expect(habitStats(h, checks, '2026-03-09')).toEqual({ rate: 50, streak: 1 });
  });
  it('次数型必须达到目标才计完成，历史修正即时更新', () => {
    const h = {
      id: 'h',
      name: '练习',
      kind: 'count' as const,
      target: 3,
      days: [1, 2, 3, 4, 5, 6, 7],
      created: '2026-03-04',
    };
    expect(
      habitStats(h, [{ id: 'a', habitId: 'h', date: '2026-03-04', value: 2 }], '2026-03-04').rate,
    ).toBe(0);
    expect(
      habitStats(h, [{ id: 'a', habitId: 'h', date: '2026-03-04', value: 3 }], '2026-03-04').rate,
    ).toBe(100);
  });
});
