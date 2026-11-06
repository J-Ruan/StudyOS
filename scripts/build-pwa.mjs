import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
const root = 'dist',
  base = '/StudyOS/';
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])),
    )
  ).flat();
}
const files = (await walk(root)).filter((f) => !f.endsWith('sw.js')).sort();
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file);
  hash.update(await readFile(file));
}
const version = hash.digest('hex').slice(0, 16);
const urls = files.map((file) => base + relative(root, file).split('\\').join('/'));
const source = `// StudyOS app-shell cache. Generated from production content; never caches user data.
const CACHE = 'studyos-${version}';
const BASE = ${JSON.stringify(base)};
const FILES = ${JSON.stringify(urls)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('studyos-') && key !== CACHE).map(key => caches.delete(key)));
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  // A controlled page always receives one complete app version, including its shell.
  const path = request.mode === 'navigate' ? BASE + 'index.html' : url.pathname;
  if (request.mode !== 'navigate' && !FILES.includes(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(path) || fetch(request);
  })());
});
`;
await writeFile(join(root, 'sw.js'), source);
console.log(`PWA ${version}: ${urls.length} static assets, scope ${base}`);
