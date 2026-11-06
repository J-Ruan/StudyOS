import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
const root = 'dist-android';
const html = await readFile(join(root, 'index.html'), 'utf8');
if (html.includes('/StudyOS/') || /<link[^>]+rel="manifest"/.test(html))
  throw Error('Android shell includes Web-only paths or manifest');
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const path = match[1];
  if (path.startsWith('#')) continue;
  if (!path.startsWith('./')) throw Error(`Android asset must be relative: ${path}`);
  await access(join(root, path));
}
try {
  await access(join(root, 'sw.js'));
  throw Error('Android build must not include a Service Worker');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log('Android shell verified: bundled relative assets, no Web Service Worker.');
