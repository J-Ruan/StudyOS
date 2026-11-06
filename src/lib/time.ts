export function localDate(value: Date | number = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export const parseDate = (key: string) => new Date(`${key}T00:00:00`);
export const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
};
export const daysBetween = (a: string, b: string) => dayNumber(b) - dayNumber(a);
export function addDays(date: string, n: number) {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return localDate(d);
}
export function monday(date = localDate()) {
  const d = parseDate(date);
  return addDays(date, -((d.getDay() + 6) % 7));
}
export const weekday = (date: string) => ((parseDate(date).getDay() + 6) % 7) + 1;
export const atTime = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();
export const dateTimeInput = (stamp: number) =>
  `${localDate(stamp)}T${new Date(stamp).toTimeString().slice(0, 5)}`;
export const fromInput = (value: string) => new Date(value).getTime();
export const clockTime = (stamp: number) =>
  new Date(stamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
export const shortDate = (stamp: number) =>
  new Date(stamp).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
export const fullDate = (stamp: number) => `${shortDate(stamp)} ${clockTime(stamp)}`;
export function duration(seconds: number) {
  const m = Math.floor(Math.max(0, seconds) / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}
export function timerText(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export function nextDue(due: number, repeat: 'daily' | 'weekly' | 'monthly') {
  const d = new Date(due);
  if (repeat === 'monthly') {
    const original = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(original, last));
  } else d.setDate(d.getDate() + (repeat === 'weekly' ? 7 : 1));
  return d.getTime();
}
export const examDays = (at: number, now = Date.now()) =>
  daysBetween(localDate(now), localDate(at));
