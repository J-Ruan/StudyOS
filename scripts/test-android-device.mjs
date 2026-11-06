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
  await page.evaluate((path) => {
    location.hash = path;
  }, path);
  await page.locator('main').waitFor();
}
async function save() {
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
}

async function pollNative(predicate, description, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${description}`);
}
async function selectBackupFromDownloads(name) {
  // Use Android's real picker, rather than injecting a File into the WebView DOM.
  await page.getByLabel('导入备份').click();
  try {
    await device.wait({ text: name }, { timeout: 2500 });
  } catch {
    await device.tap({ desc: /Show roots|显示根目录|显示位置/ }, { timeout: 10000 });
    await device.tap({ text: /^(Downloads|下载)$/ }, { timeout: 10000 });
  }
  await device.tap({ text: name }, { timeout: 15000 });
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
  await device.screenshot({ path: `${output}/native-failure.png` }).catch(() => {});
  await device.shell('uiautomator dump /sdcard/studyos-test-window.xml').catch(() => {});
  const nativeTree = await device
    .shell('cat /sdcard/studyos-test-window.xml')
    .catch(() => Buffer.from(''));
  await writeFile(`${output}/native-window.xml`, nativeTree);
  if (page) await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/failure.txt`, String(error));
  throw error;
} finally {
  await device.close();
}
