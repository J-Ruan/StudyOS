import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import App, { ErrorBoundary } from '../src/App';

vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: vi.fn() } }));
vi.mock('../src/lib/context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/context')>()),
  useData: () => {
    throw Error('IndexedDB 初始化失败');
  },
}));

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
  vi.mocked(SplashScreen.hide).mockResolvedValue(undefined);
});
afterEach(cleanup);

it('hides the native splash when database initialization fails before App mounts', async () => {
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('heading', { name: '暂时无法打开学序' })).toBeInTheDocument();
  expect(screen.getByText('IndexedDB 初始化失败')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument();
  await waitFor(() => expect(SplashScreen.hide).toHaveBeenCalledOnce());
});

it('keeps the original failure and recovery action when native splash hiding rejects', async () => {
  vi.mocked(SplashScreen.hide).mockRejectedValueOnce(Error('原生插件暂不可用'));
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('启动页关闭失败：原生插件暂不可用');
  expect(screen.getByText('IndexedDB 初始化失败')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新加载' })).toBeEnabled();
});
