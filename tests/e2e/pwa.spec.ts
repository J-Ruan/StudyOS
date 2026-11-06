import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('PWA 更新等待确认，应用壳与缓存成套切换，用户数据保留', async ({ page, context }) => {
  let version = 'v1';
  const root = join(process.cwd(), 'dist');
  const server = createServer(async (req, res) => {
    try {
      let name = new URL(req.url!, 'http://localhost').pathname.replace(/^\/StudyOS\//, '');
      if (!name || !name.includes('.')) name = 'index.html';
      if (name.includes('..')) {
        res.writeHead(403);
        res.end();
        return;
      }
      let body = await readFile(join(root, name));
      if (name === 'sw.js') {
        body = Buffer.from(
          body
            .toString()
            .replace(/const CACHE = '[^']+';/, `const CACHE = 'studyos-update-${version}';`),
        );
      }
      if (name === 'index.html')
        body = Buffer.from(
          body.toString().replace('<head>', `<head><meta name="build-id" content="${version}"/>`),
        );
      res.setHeader(
        'Content-Type',
        name.endsWith('.js')
          ? 'application/javascript'
          : name.endsWith('.css')
            ? 'text/css'
            : name.endsWith('.html')
              ? 'text/html'
              : name.endsWith('.webmanifest')
                ? 'application/manifest+json'
                : 'image/png',
      );
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(4174, '127.0.0.1', resolve));
  try {
    await page.goto('http://127.0.0.1:4174/StudyOS/#/schedule/tasks');
    await page.getByRole('button', { name: '新建任务', exact: true }).click();
    await page.getByLabel('任务标题').fill('升级后保留');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    version = 'v2';
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg!.update();
    });
    await expect(page.getByText('新版本已就绪')).toBeVisible();
    await page.reload();
    expect(await page.locator('meta[name=build-id]').getAttribute('content')).toBe('v1');
    await page.getByRole('button', { name: '更新并刷新' }).click();
    await expect(page.locator('meta[name=build-id]')).toHaveAttribute('content', 'v2');
    await expect(page.getByText('升级后保留', { exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('升级后保留', { exact: true })).toBeVisible();
    expect(await page.locator('meta[name=build-id]').getAttribute('content')).toBe('v2');
    await context.setOffline(false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  }
});
