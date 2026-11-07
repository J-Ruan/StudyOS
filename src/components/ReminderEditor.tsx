import { useState } from 'react';
import type { Reminder } from '../lib/models';
import { dateTimeInput, fromInput } from '../lib/time';
import { Button, Field } from './ui';
export function ReminderEditor({
  value,
  onChange,
  exam = false,
}: {
  value?: Reminder[];
  onChange: (value: Reminder[] | undefined) => void;
  exam?: boolean;
}) {
  const [minutes, setMinutes] = useState(30),
    [custom, setCustom] = useState('');
  const toggle = (n: number, checked: boolean) =>
    onChange(
      checked
        ? [...(value ?? []), { kind: 'before' as const, value: n }].slice(0, 8)
        : (value ?? []).filter((r) => !(r.kind === 'before' && r.value === n)),
    );
  return (
    <details className="reminder-options">
      <summary>提醒</summary>
      <Field label="提醒方式">
        <select
          value={value === undefined ? 'default' : value.length ? 'custom' : 'none'}
          onChange={(e) =>
            onChange(
              e.target.value === 'default'
                ? undefined
                : e.target.value === 'none'
                  ? []
                  : [{ kind: 'before', value: exam ? 1440 : 60 }],
            )
          }
        >
          <option value="default">使用全局默认</option>
          <option value="none">不提醒</option>
          <option value="custom">单独设置</option>
        </select>
      </Field>
      {value !== undefined && value.length > 0 && (
        <>
          <div className="reminder-presets">
            {(exam
              ? [
                  [10080, '提前七天'],
                  [4320, '提前三天'],
                  [1440, '提前一天'],
                ]
              : [
                  [1440, '提前一天'],
                  [60, '提前一小时'],
                ]
            ).map(([n, label]) => (
              <label key={n}>
                <input
                  type="checkbox"
                  checked={value.some((r) => r.kind === 'before' && r.value === n)}
                  onChange={(e) => toggle(Number(n), e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="input-action">
            <input
              aria-label="提前分钟数"
              type="number"
              min="0"
              max="525600"
              value={minutes}
              onChange={(e) => setMinutes(+e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (Number.isInteger(minutes) && minutes >= 0 && minutes <= 525600)
                  toggle(minutes, true);
              }}
            >
              添加提前分钟
            </Button>
          </div>
          <div className="input-action">
            <input
              aria-label="自定义提醒时间"
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const at = fromInput(custom);
                if (Number.isFinite(at) && at > Date.now())
                  onChange([...value, { kind: 'at' as const, value: at }].slice(0, 8));
              }}
            >
              添加时间
            </Button>
          </div>
          <div className="reminder-list">
            {value.map((r, i) => (
              <button
                type="button"
                className="reminder-chip"
                key={`${r.kind}:${r.value}:${i}`}
                aria-label={`移除提醒 ${i + 1}`}
                onClick={() => onChange(value.filter((_, n) => n !== i))}
              >
                {r.kind === 'before'
                  ? `提前 ${r.value} 分钟`
                  : dateTimeInput(r.value).replace('T', ' ')}{' '}
                ×
              </button>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
