import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const apk = process.argv[2];
if (!apk || !existsSync(apk))
  throw new Error('Usage: node scripts/android-verify.mjs <signed.apk> [--release]');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!sdk) throw new Error('Set ANDROID_HOME or ANDROID_SDK_ROOT to an installed Android SDK.');
const builds = join(sdk, 'build-tools');
const latest = '36.0.0';
if (!existsSync(join(builds, latest, 'apksigner')))
  throw new Error('Install pinned Android build-tools 36.0.0 before APK verification.');
const bin = (name) => join(builds, latest, name);
const file = resolve(apk);
const info = execFileSync(bin('aapt2'), ['dump', 'badging', file], { encoding: 'utf8' });
const signature = execFileSync(bin('apksigner'), ['verify', '--verbose', '--print-certs', file], {
  encoding: 'utf8',
});
const expected = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
if (!info.includes("package: name='com.jruan.studyos'")) throw new Error('APK package ID mismatch');
if (!info.includes(`versionName='${expected}'`))
  throw new Error('APK versionName does not match package.json');
if (!info.includes("sdkVersion:'24'") && !info.includes("minSdkVersion:'24'"))
  throw new Error('APK min SDK must remain 24');
if (!info.includes("targetSdkVersion:'36'")) throw new Error('APK target SDK must be 36');
const expectedCode = readFileSync(
  new URL('../android/app/build.gradle', import.meta.url),
  'utf8',
).match(/versionCode\s+(\d+)/)?.[1];
if (!expectedCode || !info.includes(`versionCode='${expectedCode}'`))
  throw new Error('APK versionCode does not match Android configuration');
for (const permission of [
  'READ_EXTERNAL_STORAGE',
  'WRITE_EXTERNAL_STORAGE',
  'MANAGE_EXTERNAL_STORAGE',
]) {
  if (info.includes(`android.permission.${permission}`))
    throw new Error('APK requests unnecessary broad storage permission');
}
const debug = info.includes('application-debuggable');
if (process.argv.includes('--release') && (debug || signature.includes('CN=Android Debug')))
  throw new Error('A release must not use the debug build or debug certificate.');
if (statSync(file).size < 1_000_000) throw new Error('APK is unexpectedly small');
// Read the packaged files, not just the source directory. Python is present in GitHub's Ubuntu image.
const bundled = JSON.parse(
  execFileSync(
    'python3',
    [
      '-c',
      `
import sys,zipfile,json,re
with zipfile.ZipFile(sys.argv[1]) as apk:
 names=apk.namelist()
 config=json.loads(apk.read('assets/capacitor.config.json'))
 assert not config.get('server',{}).get('url'), 'Remote server.url must not be packaged'
 assert config['appId']=='com.jruan.studyos'
 html=apk.read('assets/public/index.html').decode()
 assert '/StudyOS/' not in html, 'Web-only base path in Android HTML'
 assert 'assets/public/sw.js' not in names, 'Web-only service worker in Android APK'
 assets=[n for n in names if n.startswith('assets/public/')]
 assert any(n.endswith('.js') for n in assets) and any(n.endswith('.css') for n in assets)
 for ref in re.findall(r"""(?:src|href)=["']([^"']+)["']""",html):
  if ref.startswith(('http:','https:','//')):raise ValueError('Remote startup resource: '+ref)
  if not ref.startswith(('data:','#')): assert 'assets/public/'+ref.removeprefix('./') in names, 'Missing '+ref
 print(json.dumps({'embeddedAssets':len(assets),'serverUrl':False,'localAppShell':True}))
`,
      file,
    ],
    { encoding: 'utf8' },
  ),
);
const certificate = signature.match(/Signer #1 certificate SHA-256 digest: (.+)/)?.[1];
console.log(
  JSON.stringify(
    {
      apk: file,
      packageId: 'com.jruan.studyos',
      version: expected,
      versionCode: info.match(/versionCode='([^']+)'/)?.[1],
      minSdk: 24,
      targetSdk: 36,
      debuggable: debug,
      signatureVerified: true,
      certificateSha256: certificate,
      bytes: statSync(file).size,
      ...bundled,
    },
    null,
    2,
  ),
);
