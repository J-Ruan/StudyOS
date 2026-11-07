import { Capacitor, SystemBars, SystemBarsStyle, type PluginListenerHandle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Keyboard } from '@capacitor/keyboard';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export const NATIVE_BACK_EVENT = 'studyos:native-back';
export const NATIVE_RESUME_EVENT = 'studyos:resume';
export const isNativeApp = () => Capacitor.isNativePlatform();

export async function syncNativeTheme(dark: boolean) {
  if (!isNativeApp()) return;
  await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
  await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  // Android 15+ draws a transparent bar above the inset WebView; older Android
  // versions also need an explicit matching background.
  await StatusBar.setBackgroundColor({ color: dark ? '#19181e' : '#f7f7fa' });
}

export async function finishNativeLaunch() {
  if (isNativeApp()) await SplashScreen.hide();
}

export async function openExternalUrl(raw: string) {
  const url = new URL(raw);
  if (!['https:', 'http:', 'obsidian:'].includes(url.protocol)) throw Error('不支持此链接类型');
  if (!isNativeApp()) {
    window.open(url.href, '_blank', 'noopener,noreferrer');
    return;
  }
  if (url.protocol === 'obsidian:') {
    const result = await AppLauncher.openUrl({ url: url.href });
    if (!result.completed) throw Error('无法打开 Obsidian，请确认已安装该应用');
  } else {
    await Browser.open({ url: url.href });
  }
}

export async function shareNativeFile(blob: Blob, name: string) {
  const cleaned = [...name]
    .map((character) =>
      '/\\'.includes(character) || character.charCodeAt(0) < 32 ? '_' : character,
    )
    .join('')
    .slice(0, 200);
  const safeName = !cleaned || cleaned === '.' || cleaned === '..' ? 'StudyOS.json' : cleaned;
  const root = 'studyos-share';
  const path = `${root}/${Date.now()}-${crypto.randomUUID()}/${safeName}`;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  const { uri } = await Filesystem.writeFile({
    path,
    data: btoa(binary),
    directory: Directory.Cache,
    recursive: true,
  });
  // Keep recent files available while the selected Android app reads them.
  // Only our own cache directories, older than a day, are removed.
  const { files } = await Filesystem.readdir({ path: root, directory: Directory.Cache });
  for (const file of files) {
    const stamp = Number(file.name.split('-')[0]);
    if (file.type === 'directory' && stamp > 0 && stamp < Date.now() - 86400000)
      await Filesystem.rmdir({
        path: `${root}/${file.name}`,
        directory: Directory.Cache,
        recursive: true,
      });
  }
  await Share.share({ title: safeName, files: [uri], dialogTitle: '保存或分享文件' });
}

export async function handleNativeBack(confirmDiscard: () => Promise<boolean>) {
  const event = new Event(NATIVE_BACK_EVENT, { cancelable: true });
  if (!window.dispatchEvent(event) || document.querySelector('[role="dialog"]')) return;
  if (document.querySelector('form[aria-busy="true"]')) throw Error('正在保存，请稍候');
  if (document.querySelector('form[data-unsaved="true"]') && !(await confirmDiscard())) return;
  const path = location.hash.slice(1) || '/';
  const parts = path.split('/').filter(Boolean);
  if (path === '/stats') location.hash = '/me';
  else if (parts.length > 1) location.hash = `/${parts.slice(0, -1).join('/')}`;
  else await App.minimizeApp();
}

export function startNativeRuntime({
  notify,
  confirmDiscard,
}: {
  notify: (message: string) => void;
  confirmDiscard: () => Promise<boolean>;
}) {
  if (!isNativeApp()) return () => {};
  let disposed = false;
  let handlingBack = false;
  const listeners: PluginListenerHandle[] = [];
  const report = (error: unknown) => {
    if (!disposed) notify(error instanceof Error ? error.message : '原生操作失败，请重试');
  };
  const listen = (pending: Promise<PluginListenerHandle>) => {
    void pending
      .then((handle) => {
        if (disposed) void handle.remove().catch(report);
        else listeners.push(handle);
      })
      .catch(report);
  };
  document.documentElement.dataset.native = 'true';
  listen(
    App.addListener('backButton', () => {
      if (disposed || handlingBack) return;
      handlingBack = true;
      void handleNativeBack(confirmDiscard)
        .catch(report)
        .finally(() => {
          handlingBack = false;
        });
    }),
  );
  listen(
    App.addListener('appStateChange', ({ isActive }) => {
      if (!disposed && isActive) window.dispatchEvent(new Event(NATIVE_RESUME_EVENT));
    }),
  );
  listen(
    Keyboard.addListener('keyboardDidShow', () => {
      if (disposed) return;
      document.documentElement.dataset.keyboard = 'true';
      document.activeElement?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }),
  );
  listen(
    Keyboard.addListener('keyboardDidHide', () => {
      if (!disposed) delete document.documentElement.dataset.keyboard;
    }),
  );
  function externalLink(event: MouseEvent) {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || !(anchor instanceof HTMLAnchorElement)) return;
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    event.preventDefault();
    void openExternalUrl(anchor.href).catch(report);
  }
  document.addEventListener('click', externalLink);
  return () => {
    disposed = true;
    document.removeEventListener('click', externalLink);
    delete document.documentElement.dataset.native;
    delete document.documentElement.dataset.keyboard;
    for (const listener of listeners) void listener.remove().catch(report);
  };
}
