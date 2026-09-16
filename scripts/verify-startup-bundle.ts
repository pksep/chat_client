import { preview } from 'vite';
import { chromium, devices, expect } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const output = resolve(
  process.env.STARTUP_BUNDLE_OUTPUT || '../artifacts/chat-294-startup-bundle'
);
await mkdir(output, { recursive: true });
const html = await readFile('build/index.html', 'utf8');
const theme = html.match(
  /<script data-startup-theme>([\s\S]*?)<\/script>/
)?.[1];
expect(theme).toBeTruthy();
const scriptPolicy = html.match(/script-src ([^;]+)/)?.[1] || '';
expect(scriptPolicy).toContain(
  `'sha256-${createHash('sha256').update(theme!).digest('base64')}'`
);
expect(scriptPolicy).not.toContain("'unsafe-inline'");
const stylesheets = [
  ...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)
].map(match => match[1]);
const fontFaces = (
  await Promise.all(
    stylesheets.map(async file => {
      const css = await readFile(
        resolve('build', file.replace(/^\//, '')),
        'utf8'
      );
      return css.match(/@font-face\{[^}]+\}/g) || [];
    })
  )
).flat();
expect(fontFaces.length).toBeGreaterThan(0);
expect(
  new Set(fontFaces).size,
  'Повторные определения шрифтов в стартовом CSS'
).toBe(fontFaces.length);
const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)![1];
const preloads = [
  ...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)
].map(match => match[1]);
const main = preloads.find(path => /\/main-[^/]+\.js$/.test(path));
expect(main).toBeTruthy();
expect(preloads.some(path => /\/ui-kit-.*\.js$/.test(path))).toBe(true);
expect(
  preloads.some(path =>
    /calls-|pdf-worker-|NewContactModal-|NewGroupModal-/.test(path)
  )
).toBe(false);
const entryCode = await readFile(resolve('build', entry.slice(1)), 'utf8');
const entryImports = [
  ...entryCode.matchAll(/\bimport(?:[^;]*?from)?\s*["']([^"']+)["']/g)
].map(match => match[1]);
expect(entryImports).toHaveLength(1);
expect(entryImports[0]).toMatch(/startup-preload-/);

const server = await preview({
  configFile: false,
  build: { outDir: resolve('build') },
  preview: { host: '127.0.0.1', port: 5195, strictPort: true }
});
const browser = await chromium.launch();
const results: unknown[] = [];
try {
  for (const mobile of [false, true]) {
    for (const dark of [false, true]) {
      const context = await browser.newContext(
        mobile ? devices['Pixel 5'] : {}
      );
      const page = await context.newPage();
      await page.addInitScript(dark => {
        localStorage.setItem(
          'erp-theme-color-scheme',
          dark ? 'theme-dark' : 'theme-light'
        );
      }, dark);
      const requests: string[] = [];
      const errors: string[] = [];
      let releaseEntry!: () => void;
      const gate = new Promise<void>(resolve => {
        releaseEntry = resolve;
      });
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request =>
        requests.push(new URL(request.url()).pathname)
      );
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (url.pathname === entry) await gate;
        return route.continue();
      });
      const navigation = page.goto('http://127.0.0.1:5195/');
      try {
        // Пока стартовый скрипт ещё не выполнялся, все обязательные JS уже грузятся.
        await expect
          .poll(() => preloads.every(path => requests.includes(path)))
          .toBe(true);
        expect(
          await page.evaluate(
            () =>
              performance.getEntriesByName('chat-startup:modules-ready').length
          )
        ).toBe(0);
        expect(
          await page.evaluate(() =>
            document.documentElement.classList.contains('theme-dark')
          )
        ).toBe(dark && !mobile);
        expect(requests.some(path => path.endsWith('/theme-init.js'))).toBe(
          false
        );
        releaseEntry();
        await navigation;
        await expect(
          page.getByRole('heading', { name: 'Вход в ЧАТ' })
        ).toBeVisible({ timeout: 30_000 });
        await expect(page.locator('#startup-shell')).toHaveCount(0);
        const duplicates = [...new Set(requests)].filter(
          path =>
            /\.(js|css|woff2?)$/.test(path) &&
            requests.filter(candidate => candidate === path).length > 1
        );
        expect(duplicates).toEqual([]);
        expect(
          requests.filter(path =>
            /calls-|pdf-worker-|NewContactModal-|NewGroupModal-/.test(path)
          )
        ).toEqual([]);
        expect(errors).toEqual([]);
        results.push({
          mobile,
          dark,
          requests,
          duplicates,
          errors,
          entryImports,
          preloads
        });
        await page.screenshot({
          path: resolve(
            output,
            `first-launch-${mobile ? 'mobile' : 'desktop'}-${dark ? 'dark' : 'light'}.png`
          )
        });
      } finally {
        releaseEntry();
        await navigation.catch(() => {});
        await context.close();
      }
    }
  }
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(
    'Production startup: 4 сценария темы, CSP, ранняя загрузка без раннего выполнения и повторных запросов.'
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close(error => (error ? reject(error) : resolve()))
  );
}
