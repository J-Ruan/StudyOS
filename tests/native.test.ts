import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  native: vi.fn(() => false),
  appListener: vi.fn(),
  keyboardListener: vi.fn(),
  minimize: vi.fn(),
  browser: vi.fn(),
  launcher: vi.fn(),
  write: vi.fn(),
  read: vi.fn(),
  removeDirectory: vi.fn(),
  share: vi.fn(),
  style: vi.fn(),
  systemStyle: vi.fn(),
  background: vi.fn(),
  hideSplash: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mock.native },
  SystemBars: { setStyle: mock.systemStyle },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' },
}));
vi.mock('@capacitor/app', () => ({
  App: { addListener: mock.appListener, minimizeApp: mock.minimize },
}));
vi.mock('@capacitor/keyboard', () => ({ Keyboard: { addListener: mock.keyboardListener } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: mock.browser } }));
vi.mock('@capacitor/app-launcher', () => ({ AppLauncher: { openUrl: mock.launcher } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: { writeFile: mock.write, readdir: mock.read, rmdir: mock.removeDirectory },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: mock.share } }));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: { setStyle: mock.style, setBackgroundColor: mock.background },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: mock.hideSplash } }));

import {
  finishNativeLaunch,
  handleNativeBack,
  NATIVE_BACK_EVENT,
  NATIVE_RESUME_EVENT,
  openExternalUrl,
  startNativeRuntime,
  syncNativeTheme,
} from '../src/lib/native';
import { download } from '../src/lib/backup';

beforeEach(() => {
  vi.clearAllMocks();
  mock.native.mockReturnValue(false);
  mock.write.mockResolvedValue({ uri: 'file:///cache/StudyOS.json' });
  mock.read.mockResolvedValue({ files: [] });
  mock.share.mockResolvedValue({});
  mock.launcher.mockResolvedValue({ completed: true });
  mock.minimize.mockResolvedValue(undefined);
  mock.appListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
  mock.keyboardListener.mockResolvedValue({ remove: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => {
  document.body.innerHTML = '';
  delete document.documentElement.dataset.native;
  delete document.documentElement.dataset.keyboard;
  location.hash = '';
  vi.useRealTimers();
});

describe('platform file and link operations', () => {
  it('retains the browser download without invoking native plugins', async () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:backup');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const blob = new Blob(['backup']);
    await download(blob, 'StudyOS.json');
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(mock.write).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:backup');
  });

  it('writes base64 to Android cache and shares its URI without storage permissions', async () => {
    mock.native.mockReturnValue(true);
    await download(new Blob(['{"version":2}'], { type: 'application/json' }), 'StudyOS.json');
    expect(mock.write).toHaveBeenCalledWith({
      path: expect.stringMatching(/^studyos-share\/\d+-[^/]+\/StudyOS.json$/),
      data: btoa('{"version":2}'),
      directory: 'CACHE',
      recursive: true,
    });
    expect(mock.share).toHaveBeenCalledWith({
      title: 'StudyOS.json',
      files: ['file:///cache/StudyOS.json'],
      dialogTitle: '保存或分享文件',
    });
  });

  it('only expires its own old temporary folders and reports native failures', async () => {
    mock.native.mockReturnValue(true);
    mock.read.mockResolvedValue({
      files: [
        { name: '1-old', type: 'directory' },
        { name: `${Date.now()}-recent`, type: 'directory' },
        { name: 'unrelated', type: 'directory' },
      ],
    });
    await download(new Blob(['x']), '../file.pdf');
    expect(mock.removeDirectory).toHaveBeenCalledExactlyOnceWith({
      path: 'studyos-share/1-old',
      directory: 'CACHE',
      recursive: true,
    });
    expect(mock.share.mock.calls[0][0].title).toBe('.._file.pdf');
    mock.share.mockRejectedValueOnce(Error('分享不可用'));
    await expect(download(new Blob(['x']), 'backup.json')).rejects.toThrow('分享不可用');
    mock.write.mockRejectedValueOnce(Error('空间不足'));
    await expect(download(new Blob(['x']), 'backup.json')).rejects.toThrow('空间不足');
  });

  it('opens web links externally and handles missing Obsidian without navigating the app', async () => {
    mock.native.mockReturnValue(true);
    const original = location.href;
    await openExternalUrl('https://example.com/notes');
    expect(mock.browser).toHaveBeenCalledWith({ url: 'https://example.com/notes' });
    await openExternalUrl('obsidian://open?vault=Study');
    expect(mock.launcher).toHaveBeenCalledWith({ url: 'obsidian://open?vault=Study' });
    mock.launcher.mockResolvedValueOnce({ completed: false });
    await expect(openExternalUrl('obsidian://open')).rejects.toThrow('请确认已安装');
    await expect(openExternalUrl('javascript:alert(1)')).rejects.toThrow('不支持');
    expect(location.href).toBe(original);
  });

  it('uses the existing browser fallback for external links and native UI no-ops', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await openExternalUrl('https://example.com');
    await syncNativeTheme(true);
    await finishNativeLaunch();
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    expect(mock.browser).not.toHaveBeenCalled();
    expect(mock.style).not.toHaveBeenCalled();
    expect(mock.hideSplash).not.toHaveBeenCalled();
  });

  it('matches native status bar colors to both themes and hides the splash', async () => {
    mock.native.mockReturnValue(true);
    await syncNativeTheme(true);
    await syncNativeTheme(false);
    await finishNativeLaunch();
    expect(mock.style.mock.calls).toEqual([[{ style: 'DARK' }], [{ style: 'LIGHT' }]]);
    expect(mock.systemStyle.mock.calls).toEqual([[{ style: 'DARK' }], [{ style: 'LIGHT' }]]);
    expect(mock.background.mock.calls).toEqual([[{ color: '#19181e' }], [{ color: '#f7f7fa' }]]);
    expect(mock.hideSplash).toHaveBeenCalledOnce();
  });
});

describe('native back and lifecycle', () => {
  it('allows the top dialog to consume Back before routes or app minimization', async () => {
    location.hash = '/me/semester';
    const consume = (event: Event) => event.preventDefault();
    window.addEventListener(NATIVE_BACK_EVENT, consume, { once: true });
    await handleNativeBack(vi.fn());
    expect(location.hash).toBe('#/me/semester');
    expect(mock.minimize).not.toHaveBeenCalled();
  });

  it('returns child routes to their parent and minimizes on main pages', async () => {
    location.hash = '/focus/history';
    await handleNativeBack(vi.fn());
    expect(location.hash).toBe('#/focus');
    await handleNativeBack(vi.fn());
    expect(mock.minimize).toHaveBeenCalledOnce();
  });

  it('keeps unsaved page forms until discard is confirmed and blocks saving forms', async () => {
    location.hash = '/me/semester';
    document.body.innerHTML = '<form data-unsaved="true"></form>';
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await handleNativeBack(confirm);
    expect(location.hash).toBe('#/me/semester');
    await handleNativeBack(confirm);
    expect(location.hash).toBe('#/me');
    document.querySelector('form')!.setAttribute('aria-busy', 'true');
    await expect(handleNativeBack(confirm)).rejects.toThrow('正在保存');
    expect(mock.minimize).not.toHaveBeenCalled();
  });

  it('dispatches resume, tracks the keyboard, intercepts links and removes listeners', async () => {
    mock.native.mockReturnValue(true);
    const remove = vi.fn().mockResolvedValue(undefined);
    mock.appListener.mockResolvedValue({ remove });
    mock.keyboardListener.mockResolvedValue({ remove });
    const notify = vi.fn();
    const resume = vi.fn();
    window.addEventListener(NATIVE_RESUME_EVENT, resume);
    const stop = startNativeRuntime({ notify, confirmDiscard: vi.fn() });
    const state = mock.appListener.mock.calls.find(([name]) => name === 'appStateChange')![1];
    state({ isActive: false });
    state({ isActive: true });
    expect(resume).toHaveBeenCalledOnce();
    mock.keyboardListener.mock.calls.find(([name]) => name === 'keyboardDidShow')![1]({});
    expect(document.documentElement.dataset.keyboard).toBe('true');
    mock.keyboardListener.mock.calls.find(([name]) => name === 'keyboardDidHide')![1]();
    expect(document.documentElement.dataset.keyboard).toBeUndefined();
    document.body.innerHTML = '<a href="https://example.com"><span>资料</span></a>';
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('span')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(mock.browser).toHaveBeenCalledWith({ url: 'https://example.com/' });
    await vi.waitFor(() => expect(document.documentElement.dataset.native).toBe('true'));
    stop();
    expect(remove).toHaveBeenCalledTimes(4);
    state({ isActive: true });
    expect(resume).toHaveBeenCalledOnce();
    expect(notify).not.toHaveBeenCalled();
    window.removeEventListener(NATIVE_RESUME_EVENT, resume);
  });

  it('reports bridge registration errors and removes late listener registrations', async () => {
    mock.native.mockReturnValue(true);
    mock.appListener.mockRejectedValueOnce(Error('返回键注册失败'));
    const notify = vi.fn();
    const stop = startNativeRuntime({ notify, confirmDiscard: vi.fn() });
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith('返回键注册失败'));
    stop();
    let finish: (handle: { remove: () => Promise<void> }) => void = () => {};
    const remove = vi.fn().mockResolvedValue(undefined);
    mock.appListener.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const stopEarly = startNativeRuntime({ notify, confirmDiscard: vi.fn() });
    stopEarly();
    finish({ remove });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
  });
});
