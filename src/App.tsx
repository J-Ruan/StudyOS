import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  CalendarDays,
  Timer,
  ChartNoAxesColumnIncreasing,
  UserRound,
  Plus,
  Settings as SettingsIcon,
  X,
  ArrowUpRight,
} from 'lucide-react';
import { usePWA } from './lib/pwa';
import { DataContext, UIContext, useData, go, type Editor, type UI } from './lib/context';
import { dailySeconds } from './lib/logic';
import { localDate, duration } from './lib/time';
import { Editors } from './components/Editors';
import { Button, Modal, IconButton } from './components/ui';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Focus, { TimerRuntime } from './pages/Focus';
import Stats from './pages/Stats';
import Settings from './pages/Settings';
import {
  finishNativeLaunch,
  NATIVE_RESUME_EVENT,
  startNativeRuntime,
  syncNativeTheme,
} from './lib/native';
import { version } from '../package.json';
const nav = [
  { path: '/', label: '首页', Icon: LayoutDashboard },
  { path: '/schedule', label: '日程', Icon: CalendarDays },
  { path: '/focus', label: '专注', Icon: Timer },
  { path: '/stats', label: '统计', Icon: ChartNoAxesColumnIncreasing },
  { path: '/me', label: '我的', Icon: UserRound },
];
export default function App() {
  const data = useData();
  const [path, setPath] = useState(location.hash.slice(1) || '/'),
    [editor, setEditor] = useState<Editor>(),
    [quick, setQuick] = useState(false),
    [message, setMessage] = useState(''),
    [confirmation, setConfirmation] = useState<{
      title: string;
      detail?: string;
      resolve: (v: boolean) => void;
    }>(),
    [selection, setSelection] = useState<{ courseId?: string; taskId?: string }>({}),
    [online, setOnline] = useState(navigator.onLine),
    [now, setNow] = useState(Date.now());
  const {
    needRefresh: [refresh, setRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = usePWA();
  useEffect(() => {
    const route = () => setPath(location.hash.slice(1) || '/');
    const on = () => setOnline(navigator.onLine);
    const resume = () => {
      setNow(Date.now());
      setOnline(navigator.onLine);
    };
    window.addEventListener('hashchange', route);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    window.addEventListener(NATIVE_RESUME_EVENT, resume);
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.removeEventListener('hashchange', route);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
      window.removeEventListener(NATIVE_RESUME_EVENT, resume);
      clearInterval(interval);
    };
  }, []);
  useEffect(
    () =>
      startNativeRuntime({
        notify: setMessage,
        confirmDiscard: () =>
          new Promise<boolean>((resolve) =>
            setConfirmation({
              title: '放弃未保存的修改？',
              detail: '返回后，这次尚未保存的内容将丢失。',
              resolve,
            }),
          ),
      }),
    [],
  );
  const loaded = !!data;
  useEffect(() => {
    if (loaded)
      void finishNativeLaunch().catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : '启动页关闭失败，请重新打开应用');
      });
  }, [loaded]);
  useEffect(() => {
    const error = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setMessage(
        event.reason instanceof Error ? event.reason.message : '操作失败，请检查本机存储空间后重试',
      );
    };
    window.addEventListener('unhandledrejection', error);
    return () => window.removeEventListener('unhandledrejection', error);
  }, []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (!offlineReady) return;
    const timeout = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(timeout);
  }, [offlineReady, setOfflineReady]);
  const theme = data?.settings.theme;
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      void syncNativeTheme(dark).catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : '状态栏更新失败，请重试');
      });
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    document.title = `${nav.find((n) => (n.path === '/' ? path === '/' : path.startsWith(n.path)))?.label ?? '学序'} · 学序`;
  }, [path]);
  const ui = useMemo<UI>(
    () => ({
      open: (e) => {
        setQuick(false);
        setEditor(e);
      },
      close: () => setEditor(undefined),
      notify: setMessage,
      confirm: (title, detail) =>
        new Promise((resolve) => setConfirmation({ title, detail, resolve })),
      focus: (courseId, taskId) => {
        setSelection({ courseId, taskId });
        go('/focus');
      },
      focusCourse: selection.courseId,
      focusTask: selection.taskId,
    }),
    [selection],
  );
  if (!data)
    return (
      <div className="loading-screen">
        <BookOpen size={32} />
        <p>正在打开学序…</p>
      </div>
    );
  const current =
    nav.find((n) => (n.path === '/' ? path === '/' : path.startsWith(n.path)))?.path ?? '/';
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekSeconds = [...dailySeconds(data.sessions)]
    .filter(([day]) => day >= localDate(weekStart) && day <= localDate(now))
    .reduce((n, [, s]) => n + s, 0);
  return (
    <UIContext.Provider value={ui}>
      <DataContext.Provider value={data}>
        <TimerRuntime />
        <div className="app-shell">
          <aside className="sidebar">
            <a className="brand" href="#/">
              <span>
                <BookOpen size={24} />
              </span>
              <strong>
                学序<i>StudyOS</i>
              </strong>
            </a>
            <nav aria-label="主导航">
              {nav.map(({ path: link, label, Icon }) => (
                <a
                  href={`#${link}`}
                  key={link}
                  aria-current={current === link ? 'page' : undefined}
                  className={current === link ? 'nav-active' : ''}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                  {link === '/focus' && data.timer && <i className="nav-dot" />}
                </a>
              ))}
            </nav>
            <button className="sidebar-add" onClick={() => setQuick(true)}>
              <Plus size={18} />
              快捷新增
            </button>
            <div className="sidebar-bottom">
              <div className="sidebar-week">
                <span>本周专注</span>
                <strong>{duration(weekSeconds)}</strong>
                <div>
                  <span style={{ width: `${Math.min(100, (weekSeconds / 36000) * 100)}%` }} />
                </div>
              </div>
              <button className="sidebar-settings" onClick={() => go('/me')}>
                <SettingsIcon size={17} />
                <span>设置</span>
                <span className="version">v{version}</span>
              </button>
            </div>
          </aside>
          <div className="main-shell">
            <header className="topbar">
              <div>
                <BookOpen size={19} />
                <span>个人学习控制台</span>
              </div>
              <div className="topbar-actions">
                {!online && <span className="offline-tag">离线</span>}
                {data.timer && current !== '/focus' && (
                  <button className="text-button timer-running" onClick={() => go('/focus')}>
                    <i />
                    专注{data.timer.running ? '中' : '已暂停'}
                  </button>
                )}
                <IconButton label="快捷新增" onClick={() => setQuick(true)}>
                  <Plus size={21} />
                </IconButton>
                <IconButton label="设置" onClick={() => go('/me')}>
                  <SettingsIcon size={19} />
                </IconButton>
              </div>
            </header>
            <main tabIndex={-1} id="main-content" key={current === '/' ? 'home' : current}>
              {current === '/' ? (
                <Dashboard />
              ) : current === '/schedule' ? (
                <Schedule path={path} />
              ) : current === '/focus' ? (
                <Focus path={path} key={`${selection.courseId}-${selection.taskId}`} />
              ) : current === '/stats' ? (
                <Stats path={path} />
              ) : (
                <Settings path={path} />
              )}
            </main>
            <footer className="app-footer">
              <span>学序 · StudyOS</span>
              <span>{new Date(now).getFullYear()}</span>
            </footer>
          </div>
          <nav className="bottom-nav" aria-label="移动导航">
            {nav.map(({ path: link, label, Icon }) => (
              <a
                href={`#${link}`}
                key={link}
                aria-current={current === link ? 'page' : undefined}
                className={current === link ? 'nav-active' : ''}
              >
                <Icon size={21} />
                <span>{label}</span>
              </a>
            ))}
          </nav>
        </div>
        {editor && (
          <Editors
            key={`${editor.kind}:${editor.id ?? editor.courseId ?? 'new'}:${editor.occurrence?.key ?? ''}`}
            editor={editor}
          />
        )}
        {quick && (
          <Modal title="快捷新增" onClose={() => setQuick(false)}>
            <div className="quick-grid">
              {(
                [
                  { kind: 'task', label: '任务', Icon: Plus },
                  { kind: 'course', label: '课程', Icon: BookOpen },
                  { kind: 'exam', label: '考试', Icon: CalendarDays },
                  { kind: 'habit', label: '习惯', Icon: ChartNoAxesColumnIncreasing },
                ] as const
              ).map(({ kind, label, Icon }) => (
                <button key={kind} onClick={() => ui.open({ kind })}>
                  <Icon size={22} />
                  <span>{label}</span>
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
          </Modal>
        )}
        {confirmation && (
          <Modal
            title={confirmation.title}
            onClose={() => {
              confirmation.resolve(false);
              setConfirmation(undefined);
            }}
          >
            {confirmation.detail && <p className="confirm-detail">{confirmation.detail}</p>}
            <div className="form-footer">
              <Button
                variant="secondary"
                onClick={() => {
                  confirmation.resolve(false);
                  setConfirmation(undefined);
                }}
              >
                取消
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  confirmation.resolve(true);
                  setConfirmation(undefined);
                }}
              >
                确认
              </Button>
            </div>
          </Modal>
        )}
        {message && (
          <div className={`toast ${refresh || offlineReady ? 'with-banner' : ''}`} role="status">
            {message}
            <button aria-label="关闭提示" onClick={() => setMessage('')}>
              <X size={15} />
            </button>
          </div>
        )}
        {(refresh || offlineReady) && (
          <div className="update-banner" role="status">
            <span>{refresh ? '新版本已就绪' : '已可离线使用'}</span>
            {refresh ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (data.timer) {
                    setMessage('请先结束计时，再更新应用');
                    return;
                  }
                  await updateServiceWorker();
                }}
              >
                更新并刷新
              </Button>
            ) : null}
            <IconButton
              label="关闭更新提示"
              onClick={() => {
                setRefresh(false);
                setOfflineReady(false);
              }}
            >
              <X size={17} />
            </IconButton>
          </div>
        )}
      </DataContext.Provider>
    </UIContext.Provider>
  );
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="error-screen">
        <BookOpen size={30} />
        <h1>暂时无法打开学序</h1>
        <p>{this.state.error}</p>
        <p>请检查浏览器是否允许本地存储。现有数据不会被自动清除。</p>
        <Button onClick={() => location.reload()}>重新加载</Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
