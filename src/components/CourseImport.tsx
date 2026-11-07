import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { useStore, useUI } from '../lib/context';
import {
  importFields,
  fieldLabels,
  guessMapping,
  readCourseFile,
  previewCourses,
  importCourses,
  type Mapping,
} from '../lib/course-import';
import { Button, Modal, Field } from './ui';
import { download } from '../lib/backup';
export default function CourseImport() {
  const d = useStore(),
    ui = useUI();
  const [rows, setRows] = useState<string[][]>(),
    [header, setHeader] = useState(0),
    [mapping, setMapping] = useState<Mapping>(),
    [mode, setMode] = useState<'skip' | 'merge'>('merge'),
    [skip, setSkip] = useState(false),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState('');
  const preview = useMemo(() => {
    if (!rows || !mapping) return undefined;
    try {
      return {
        ...previewCourses(
          rows.slice(header + 1),
          mapping,
          d.courses,
          d.settings.semester,
          mode,
          skip,
        ),
        failure: '',
      };
    } catch (e) {
      return {
        courses: [],
        added: 0,
        merged: 0,
        skipped: 0,
        conflicts: 0,
        duplicates: 0,
        errors: [],
        failure: String(e),
      };
    }
  }, [rows, header, mapping, d.courses, d.settings.semester, mode, skip]);
  async function load(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const values = await readCourseFile(file);
      if (values.length < 2) throw Error('文件至少需要标题行和一行课程');
      setRows(values);
      setHeader(0);
      setMapping(guessMapping(values[0]));
      setConfirmed(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="import-entry">
        <label className={`button secondary file-button ${busy ? 'disabled' : ''}`}>
          <Upload size={17} />
          导入课表
          <input
            type="file"
            disabled={busy}
            accept=".csv,.xlsx"
            onChange={(e) => {
              void load(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
        <Button
          variant="ghost"
          onClick={async () => {
            try {
              const blob = new Blob(
                [
                  '\uFEFF课程名称,任课教师,教室,星期,开始节次,结束节次,起始教学周,结束教学周,单双周规则\n高等数学,陈老师,A203,一,1,2,1,16,每周\n',
                ],
                { type: 'text/csv;charset=utf-8' },
              );
              await download(blob, 'StudyOS-课程模板.csv');
            } catch (e) {
              ui.notify(String(e));
            }
          }}
        >
          CSV 模板
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      {rows && mapping && (
        <Modal
          title="导入课程表"
          wide
          onClose={() => {
            if (!busy) setRows(undefined);
          }}
        >
          <div className="import-steps" aria-label="导入阶段">
            文件 → <strong>字段映射与预览</strong> → 确认
          </div>
          <Field label="标题所在行">
            <select
              value={header}
              onChange={(e) => {
                const n = +e.target.value;
                setHeader(n);
                setMapping(guessMapping(rows[n]));
                setConfirmed(false);
              }}
            >
              {rows.slice(0, 10).map((_, i) => (
                <option value={i} key={i}>
                  第 {i + 1} 行
                </option>
              ))}
            </select>
          </Field>
          <div className="form-grid three">
            {importFields.map((field) => (
              <Field key={field} label={fieldLabels[field]}>
                <select
                  value={mapping[field]}
                  onChange={(e) => {
                    setMapping({ ...mapping, [field]: +e.target.value });
                    setConfirmed(false);
                  }}
                >
                  <option value={-1}>
                    不映射{['name', 'day', 'start', 'end'].includes(field) ? '（必填）' : ''}
                  </option>
                  {rows[header].map((name, i) => (
                    <option key={i} value={i}>
                      {name || `列 ${i + 1}`}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <Field label="重复课程处理">
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as typeof mode);
                setConfirmed(false);
              }}
            >
              <option value="merge">合并同名、教师和教室相同的时段</option>
              <option value="skip">跳过已有课程</option>
            </select>
          </Field>
          <label className="switch-row">
            <span>跳过时间冲突课程</span>
            <input
              type="checkbox"
              checked={skip}
              onChange={(e) => {
                setSkip(e.target.checked);
                setConfirmed(false);
              }}
            />
          </label>
          {preview && (
            <>
              <p className="import-summary">
                新增 {preview.added} · 合并 {preview.merged} · 跳过 {preview.skipped} · 冲突{' '}
                {preview.conflicts}
              </p>
              {preview.failure && (
                <p role="alert" className="error-message">
                  {preview.failure}
                </p>
              )}
              {preview.errors.length > 0 && (
                <div role="alert" className="error-message">
                  {preview.errors.slice(0, 8).map((e, i) => (
                    <p key={i}>{e}</p>
                  ))}
                </div>
              )}
              <div className="import-preview">
                {preview.courses.slice(0, 30).map((c) => (
                  <article key={c.id}>
                    <strong>{c.name}</strong>
                    <span>
                      {c.teacher} {c.room}
                    </span>
                    <span>{c.slots.length} 个时段</span>
                  </article>
                ))}
              </div>
              {preview.courses.length > 30 && (
                <p className="muted">另有 {preview.courses.length - 30} 门课程</p>
              )}
              <label className="switch-row">
                <span>已核对预览，确认写入这些课程</span>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
              </label>
              <div className="form-footer">
                <Button
                  disabled={
                    busy ||
                    !confirmed ||
                    !preview.courses.length ||
                    !!preview.failure ||
                    !!preview.errors.length ||
                    (!skip && preview.conflicts > 0)
                  }
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const result = await importCourses(
                        rows.slice(header + 1),
                        mapping,
                        mode,
                        skip,
                      );
                      setRows(undefined);
                      ui.notify(`已导入 ${result.courses.length} 门课程`);
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  确认导入
                </Button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
