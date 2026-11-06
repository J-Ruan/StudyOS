import { _android } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const output = 'android-device-results';
await mkdir(output, { recursive: true });
const apk = process.env.ANDROID_TEST_APK ?? 'android/app/build/outputs/apk/debug/app-debug.apk';
const [device] = await _android.devices();
assert(device, 'No Android emulator/device attached');
device.setDefaultTimeout(60000);
let page;
let phase = 'connect-device';
const notes = [];
const check = (label) => {
  notes.push(label);
  console.log(`PASS ${label}`);
};
const dbRows = (table) =>
  page.evaluate(
    (table) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('studyos');
        req.onsuccess = () => {
          const db = req.result;
          const q = db.transaction(table).objectStore(table).getAll();
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
          q.onerror = () => reject(q.error);
        };
        req.onerror = () => reject(req.error);
      }),
    table,
  );
async function open(path) {
  phase = `navigate:${path}`;
  await page.evaluate((path) => {
    location.hash = path;
  }, path);
  await page.locator('main').waitFor();
}
async function save() {
  const dialogs = page.getByRole('dialog');
  const title = (await dialogs.count()) ? await dialogs.last().getAttribute('aria-label') : 'page';
  phase = `save:${title}`;
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  phase = `saved:${title}`;
}

async function pollNative(predicate, description, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${description}`);
}
function decodeXml(value) {
  return value.replace(
    /&(?:quot|apos|lt|gt|amp);/g,
    (entity) => ({ '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&' })[entity],
  );
}
function summarizeNativeTree(xml) {
  return [...xml.matchAll(/<node\b([^>]*)>/g)]
    .map((match) => {
      const attributes = Object.fromEntries(
        [...match[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map((attribute) => [
          attribute[1],
          decodeXml(attribute[2]),
        ]),
      );
      return {
        text: attributes.text ?? '',
        desc: attributes['content-desc'] ?? '',
        res: attributes['resource-id'] ?? '',
        pkg: attributes.package ?? '',
        enabled: attributes.enabled !== 'false',
        clickable: attributes.clickable === 'true',
        bounds: attributes.bounds ?? '',
      };
    })
    .filter((node) => {
      const bounds = node.bounds.match(/-?\d+/g)?.map(Number);
      return (
        (node.text || node.desc || node.res) &&
        (!bounds || (bounds[2] > bounds[0] && bounds[3] > bounds[1]))
      );
    });
}
async function foregroundActivity() {
  const activities = (await device.shell('dumpsys activity activities')).toString();
  return (
    (activities.match(/(?:mResumedActivity|topResumedActivity)[^\n]*/g) ?? []).at(-1) ??
    'No resumed activity reported'
  );
}
async function captureNativeUi() {
  const foreground = await foregroundActivity();
  await device.shell('rm -f /sdcard/studyos-test-window.xml');
  const result = await device.shell('uiautomator dump /sdcard/studyos-test-window.xml');
  const xml = (await device.shell('cat /sdcard/studyos-test-window.xml')).toString();
  if (!xml.includes('<hierarchy'))
    throw new Error(
      `Native UI hierarchy unavailable (${foreground}): ${result.toString().slice(0, 300)}`,
    );
  return { xml, nodes: summarizeNativeTree(xml), foreground };
}
async function tapNativeNode(node) {
  // The shell dump and the Playwright UI driver would compete for UiAutomation.
  // Click the center of the freshly identified real Android control using ADB.
  const bounds = node.bounds.match(/-?\d+/g)?.map(Number);
  assert(
    bounds?.length === 4 && bounds[2] > bounds[0] && bounds[3] > bounds[1],
    'Native control has no visible bounds',
  );
  const x = Math.round((bounds[0] + bounds[2]) / 2),
    y = Math.round((bounds[1] + bounds[3]) / 2);
  await device.shell(`input tap ${x} ${y}`);
}
async function selectBackupFromDownloads(name) {
  // Use Android's actual picker; do not inject a File into the WebView DOM.
  phase = 'backup:open-system-picker';
  await page.getByLabel('导入备份').click();
  await pollNative(
    async () =>
      /documentsui|DocumentsActivity|PickerActivity|ChooserActivity|ResolverActivity/i.test(
        await foregroundActivity(),
      ),
    'Android document picker or system Files chooser',
    20000,
  );
  const navigated = new Set();
  let selected = false;
  for (let attempt = 0; attempt < 10 && !selected; attempt++) {
    const state = await captureNativeUi();
    const available = state.nodes.filter((node) => node.enabled);
    const file = available.find((node) => node.text === name || node.desc === name);
    if (file) {
      phase = 'backup:select-json-file';
      await tapNativeNode(file);
      selected = true;
      break;
    }
    const once = available.find((node) => /^(Just once|仅此一次)$/i.test(node.text));
    if (once) {
      phase = 'backup:choose-files-once';
      await tapNativeNode(once);
      continue;
    }
    const files = available.find((node) =>
      /^(Files|Files by Google|文件|文件管理器)$/i.test(node.text),
    );
    if (files && /ChooserActivity|ResolverActivity/i.test(state.foreground)) {
      phase = 'backup:choose-system-files';
      await tapNativeNode(files);
      continue;
    }
    // Some Android Documents versions open the roots drawer initially.
    const downloadNodes = available.filter((node) =>
      /^(Downloads|下载)$/i.test(node.text || node.desc),
    );
    const downloads =
      downloadNodes.find((node) => /:id\/(?:title|root_title|root_name)$/.test(node.res)) ??
      downloadNodes.find((node) => node.clickable) ??
      downloadNodes[0];
    if (downloads && !navigated.has('downloads')) {
      phase = 'backup:downloads-root';
      navigated.add('downloads');
      await tapNativeNode(downloads);
      continue;
    }
    const drawer = available.find((node) =>
      /^(Show roots|Show navigation drawer|Navigate up|显示根目录|显示导航抽屉|显示位置|向上导航)$/i.test(
        node.desc,
      ),
    );
    if (drawer && !navigated.has('drawer')) {
      phase = 'backup:open-roots-drawer';
      navigated.add('drawer');
      navigated.delete('downloads');
      await tapNativeNode(drawer);
      continue;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(selected, 'Android document picker did not expose the pushed backup file');
  await pollNative(
    async () => {
      const current = await foregroundActivity();
      if (/com\.jruan\.studyos/.test(current)) return true;
      const state = await captureNativeUi();
      const confirm = state.nodes.find(
        (node) => node.enabled && /^(Open|Select|打开|选择)$/i.test(node.text),
      );
      if (confirm) {
        phase = 'backup:confirm-file-selection';
        await tapNativeNode(confirm);
      }
      return false;
    },
    'Android document picker returns the selected file',
    15000,
  );
  phase = 'backup:parse-selected-json';
  await page.getByRole('dialog', { name: '恢复备份', exact: true }).waitFor();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await page.getByRole('dialog', { name: '恢复备份', exact: true }).waitFor({ state: 'hidden' });
}
async function verifyNativeBackup() {
  await open('/me');
  await page.getByRole('button', { name: '导出备份', exact: true }).click();
  await pollNative(async () => {
    const activities = (await device.shell('dumpsys activity activities')).toString();
    return /(?:mResumedActivity|topResumedActivity)[^\n]*(?:ChooserActivity|ResolverActivity)/.test(
      activities,
    );
  }, 'Android system share activity');
  await device.screenshot({ path: `${output}/system-share.png` });
  await device.shell('input keyevent 4');
  const listed = (
    await device.shell('run-as com.jruan.studyos find cache/studyos-share -type f -name "*.json"')
  )
    .toString()
    .trim()
    .split('\n');
  const candidates = listed
    .filter((path) =>
      /^cache\/studyos-share\/[0-9]+-[0-9a-f-]+\/StudyOS-\d{4}-\d{2}-\d{2}\.json$/.test(path),
    )
    .sort((a, b) => Number(b.split('/')[2].split('-')[0]) - Number(a.split('/')[2].split('-')[0]));
  assert(candidates.length, 'Native Filesystem did not write a JSON backup');
  const raw = (await device.shell(`run-as com.jruan.studyos cat ${candidates[0]}`)).toString();
  const backup = JSON.parse(raw);
  assert.equal(backup.app, 'StudyOS');
  assert.equal(backup.version, 2);
  for (const table of ['courses', 'tasks', 'sessions'])
    assert.equal(backup.data[table].length, (await dbRows(table)).length);
  assert.equal(backup.data.tasks[0].title, 'Android 离线任务');
  check('Native Filesystem JSON export and actual Android system share panel');
  const filename = 'StudyOS-native-roundtrip.json';
  await device.shell('mkdir -p /sdcard/Download');
  await device.push(Buffer.from(raw), `/sdcard/Download/${filename}`);
  await device.shell(
    `am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/${filename}`,
  );
  await open('/schedule/tasks');
  await page.locator('.task-content').filter({ hasText: 'Android 离线任务' }).click();
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal((await dbRows('tasks')).length, 0);
  await open('/me');
  await selectBackupFromDownloads(filename);
  assert.equal((await dbRows('tasks')).length, 1);
  assert.equal((await dbRows('courses')).length, 1);
  assert.equal((await dbRows('sessions')).length, 1);
  await selectBackupFromDownloads(filename);
  assert.equal((await dbRows('tasks')).length, 1);
  assert.equal((await dbRows('sessions')).length, 1);
  await page.screenshot({ path: `${output}/backup-restored.png` });
  check(
    'Android document picker imports exported JSON and repeated merge preserves unique records',
  );
}

try {
  assert.equal(
    (await device.shell('getprop ro.kernel.qemu')).toString().trim(),
    '1',
    'This data-modifying smoke test requires an isolated Android emulator',
  );
  execFileSync('adb', ['-s', device.serial(), 'install', '-r', apk], { stdio: 'inherit' });
  await device.shell('svc wifi disable');
  await device.shell('svc data disable');
  await device.shell('am force-stop com.jruan.studyos');
  await device.shell('am start -n com.jruan.studyos/.MainActivity');
  const view = await device.webView({ pkg: 'com.jruan.studyos' });
  page = await view.page();
  page.setDefaultTimeout(30000);
  await page.getByRole('heading', { name: '今天', exact: true }).waitFor();
  assert.equal(new URL(page.url()).hostname, 'localhost');
  assert.equal(await page.evaluate(() => window.Capacitor.isNativePlatform()), true);
  assert.equal(await page.evaluate(() => navigator.serviceWorker?.controller ?? null), null);
  check('First launch offline with packaged localhost resources and no Service Worker');
  await open('/me/semester');
  await page.getByLabel('学期名称').fill('Android 自动化学期');
  await save();
  await open('/schedule');
  await page
    .locator('.page-heading')
    .getByRole('button', { name: '新建课程', exact: true })
    .click();
  await page.getByLabel('课程名称').fill('Android 数学');
  await save();
  assert.equal((await dbRows('courses')).length, 1);
  check('Native IndexedDB semester and course creation');
  await open('/schedule/tasks');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByLabel('任务标题').fill('Android 离线任务');
  await save();
  await page.getByText('Android 离线任务', { exact: true }).waitFor();
  check('Task creation and persistence');
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  // Blur prevents the input from reopening the IME; keyboardDidHide updates the
  // runtime dataset. Await that state rather than guessing an animation duration.
  phase = 'back:empty-task:hide-ime';
  await page.getByRole('dialog', { name: '新建任务', exact: true }).waitFor();
  await page.evaluate(async () => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await window.Capacitor.Plugins.Keyboard.hide();
  });
  await page.waitForFunction(() => document.documentElement.dataset.keyboard !== 'true');
  phase = 'back:empty-task:dispatch';
  await device.shell('input keyevent 4');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  check('Android back closes an empty modal first');
  await open('/me/semester');
  await device.shell('input keyevent 4');
  await page.waitForFunction(() => location.hash === '#/me');
  check('Android back returns from child page');
  await open('/focus');
  await page.getByRole('button', { name: '正向计时', exact: true }).click();
  await page.getByRole('button', { name: '开始专注', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).waitFor();
  await device.shell('input keyevent 3');
  await new Promise((r) => setTimeout(r, 1500));
  await device.shell('am start -n com.jruan.studyos/.MainActivity');
  await page.getByRole('button', { name: '结束', exact: true }).click();
  await page.getByRole('button', { name: '保存并结束', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const sessions = await dbRows('sessions');
  assert.equal(sessions.length, 1);
  assert(sessions[0].seconds >= 1);
  assert.equal((await dbRows('tasks'))[0].done, false);
  check('Background/resume timestamps and single focus record');
  await verifyNativeBackup();
  await open('/stats');
  await page.locator('.stats-overview').waitFor();
  check('Statistics render from native records');
  await open('/me');
  await page.getByRole('button', { name: '深色', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  check('Dark mode');
  await page.screenshot({ path: `${output}/dark.png` });
  // Simulate process death, then cold-start offline and verify persisted entities.
  await device.shell('am force-stop com.jruan.studyos');
  await device.shell('am start -n com.jruan.studyos/.MainActivity');
  page = await (await device.webView({ pkg: 'com.jruan.studyos' })).page();
  await page.locator('main').waitFor();
  assert.equal((await dbRows('tasks')).length, 1);
  assert.equal((await dbRows('sessions')).length, 1);
  assert.equal((await dbRows('courses')).length, 1);
  check('Cold-start offline retains database v2 data');
  await device.shell('settings put system accelerometer_rotation 0');
  await device.shell('settings put system user_rotation 1');
  await new Promise((r) => setTimeout(r, 800));
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  );
  await page.screenshot({ path: `${output}/landscape.png` });
  await device.shell('settings put system user_rotation 0');
  check('Landscape layout without document overflow');
  await writeFile(
    `${output}/summary.json`,
    JSON.stringify({ platform: 'Android emulator', checks: notes, physicalDevice: false }, null, 2),
  );
} catch (error) {
  const browserState = page
    ? await page
        .evaluate(() => {
          const active = document.activeElement;
          const controls = [
            ...document.querySelectorAll('input:invalid, select:invalid, textarea:invalid'),
          ].slice(0, 15);
          return {
            hash: location.hash,
            keyboard: document.documentElement.dataset.keyboard ?? 'hidden-or-unreported',
            active: active
              ? {
                  tag: active.tagName,
                  type: active.getAttribute('type'),
                  role: active.getAttribute('role'),
                  ariaLabel: active.getAttribute('aria-label'),
                }
              : null,
            modals: [...document.querySelectorAll('[role=dialog]')]
              .map((node) => node.getAttribute('aria-label'))
              .slice(0, 10),
            invalid: controls.map((control) => ({
              tag: control.tagName,
              type: control.getAttribute('type'),
              label: control.labels?.[0]?.textContent?.trim().slice(0, 120),
              validationMessage: control.validationMessage?.slice(0, 400),
            })),
            alerts: [...document.querySelectorAll('[role=alert]')]
              .map((node) => node.textContent?.trim().slice(0, 600))
              .slice(0, 5),
            forms: [...document.querySelectorAll('form')]
              .map((node) => ({
                busy: node.getAttribute('aria-busy'),
                unsaved: node.getAttribute('data-unsaved'),
              }))
              .slice(0, 10),
          };
        })
        .catch((captureError) => ({ captureError: String(captureError) }))
    : null;
  const nativeState = await captureNativeUi().catch(async (captureError) => ({
    captureError: String(captureError),
    xml: '',
    nodes: [],
    foreground: await foregroundActivity().catch((activityError) => String(activityError)),
  }));
  const diagnostics = {
    phase,
    passed: notes,
    error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    browser: browserState,
    native: {
      foreground: nativeState.foreground,
      captureError: nativeState.captureError,
      controls: nativeState.nodes.slice(0, 70).map((node) => ({
        ...node,
        text: node.text.slice(0, 140),
        desc: node.desc.slice(0, 140),
        res: node.res.slice(0, 180),
        pkg: node.pkg.slice(0, 120),
      })),
    },
  };
  await writeFile(`${output}/failure-diagnostics.json`, JSON.stringify(diagnostics, null, 2));
  const detail = JSON.stringify(diagnostics)
    .slice(0, 14000)
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.log(`::error title=Android emulator smoke::${detail}`);
  await device.screenshot({ path: `${output}/native-failure.png` }).catch(() => {});
  await writeFile(`${output}/native-window.xml`, nativeState.xml);
  if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.txt`, String(error));
  throw error;
} finally {
  await device.close();
}
