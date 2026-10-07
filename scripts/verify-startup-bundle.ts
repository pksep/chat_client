import { preview } from 'vite';
import { chromium, devices, expect } from '@playwright/test';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createAndroidPerformanceServer } from '../e2e/fixtures/android-performance-server.ts';

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
      expect(
        css,
        'Шрифты не должны блокировать CSS всех алфавитов'
      ).not.toContain('data:font/woff');
      return css.match(/@font-face\{[^}]+\}/g) || [];
    })
  )
).flat();
expect(fontFaces.length).toBeGreaterThan(0);
expect(
  new Set(fontFaces).size,
  'Повторные определения шрифтов в стартовом CSS'
).toBe(fontFaces.length);
const fontHashes = new Set(
  await Promise.all(
    (await readdir('build/assets'))
      .filter(file => /\.woff2?$/.test(file))
      .map(async file =>
        createHash('sha256')
          .update(await readFile(resolve('build/assets', file)))
          .digest('hex')
      )
  )
);
const kitStyles = await readFile(
  'node_modules/@pksep/yui/dist/style.css',
  'utf8'
);
for (const match of kitStyles.matchAll(
  /data:font\/woff2?;base64,([A-Za-z0-9+/=]+)/g
)) {
  const hash = createHash('sha256')
    .update(Buffer.from(match[1], 'base64'))
    .digest('hex');
  expect(
    fontHashes.has(hash),
    'Вынесенный шрифт должен побайтно совпадать с исходным'
  ).toBe(true);
}
const entry = html.match(/<script type="module"[^>]*src="([^"]+)"/)![1];
const preloads = [
  ...html.matchAll(/<link rel="modulepreload"[^>]*href="([^"]+)"/g)
].map(match => match[1]);
const main = preloads.find(path => /\/main-[^/]+\.js$/.test(path));
expect(main).toBeTruthy();
expect(preloads.some(path => /\/ui-kit-.*\.js$/.test(path))).toBe(true);
expect(
  preloads.some(path =>
    /calls-|ai-mastra-|pdf-worker-|_chat-ui-pdf-runtime-|_chat-ui-emoji-runtime-|_chat-ui-editor-runtime-|_chat-ui-slider-runtime-|AuthorizationScreen-|NewContactModal-|NewGroupModal-/.test(
      path
    )
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
        ).toBe(dark);
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
            /calls-|pdf-worker-|_chat-ui-editor-runtime-|_chat-ui-slider-runtime-|NewContactModal-|NewGroupModal-/.test(
              path
            )
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
  const fixture = await createAndroidPerformanceServer({
    port: 5196,
    userCount: 40,
    messagesPerTopic: 20
  });
  try {
    for (const mobile of [false, true]) {
      const context = await browser.newContext(
        mobile ? devices['Pixel 5'] : {}
      );
      try {
        const page = await context.newPage();
        const requests: string[] = [];
        const errors: string[] = [];
        page.on('request', request =>
          requests.push(new URL(request.url()).pathname)
        );
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', route =>
          new URL(route.request().url()).hostname === '127.0.0.1'
            ? route.continue()
            : route.abort()
        );
        await page.addInitScript(
          ({ origin, config, user, topics }) => {
            localStorage.setItem(
              'chat_auth_session',
              JSON.stringify({ token: 'startup-local-fixture', user })
            );
            localStorage.setItem(
              'chat_runtime_organizations',
              JSON.stringify([{ url: origin, config }])
            );
            localStorage.setItem('chat_runtime_last_organization', origin);
            localStorage.setItem(
              `chat-offline-fast-topics-v1:${user.id}`,
              JSON.stringify(topics)
            );
            localStorage.setItem(
              'chat.indexeddb.reset.done',
              'chat-client-indexeddb-reset-2026-04-29-v1'
            );
          },
          {
            origin: fixture.origin,
            config: fixture.config,
            user: fixture.user,
            topics: fixture.topics
          }
        );
        await page.goto('http://127.0.0.1:5195/');
        const target = page.locator(
          `[data-topic-id="${fixture.topics[1].id}"]:visible`
        );
        await expect(target).toBeVisible();
        await expect(page.locator('#startup-shell')).toHaveCount(0);
        expect(
          requests.filter(path =>
            /AuthorizationScreen-|ai-mastra-|pdf-worker-|_chat-ui-pdf-runtime-|_chat-ui-emoji-runtime-|_chat-ui-editor-runtime-|_chat-ui-slider-runtime-/.test(
              path
            )
          )
        ).toEqual([]);
        if (mobile)
          await page
            .getByRole('button', { name: 'Остаться в браузере' })
            .click();
        await target.click();
        await expect(
          page.locator('[data-message-id]:visible').first()
        ).toBeVisible();
        await expect(
          page.locator('[data-testid$="-MessageList-Skeleton"]')
        ).toHaveCount(0);
        const emojiRequests = () =>
          requests.filter(path => /_chat-ui-emoji-runtime-/.test(path));
        expect(emojiRequests()).toEqual([]);
        const emojiTrigger = page
          .locator('.editor-component .smile-button:visible')
          .first();
        await emojiTrigger.click();
        const picker = page.locator(
          '.emoji-picker--open .v3-emoji-picker:visible'
        );
        await expect(picker).toBeVisible();
        await expect(
          picker.locator('.v3-groups .v3-group[aria-label="Флаги"]')
        ).toHaveCount(1);
        const emoji = picker.locator('.v3-emojis button:visible').first();
        const emojiText = (await emoji.innerText()).trim();
        await emoji.click();
        const editor = page.locator('.editor-content .ProseMirror:visible');
        await expect(editor).toContainText(emojiText);
        await editor.press('End');
        await editor.press('ControlOrMeta+b');
        await editor.pressSequentially(' Проверка редактора');
        await editor.press('ControlOrMeta+b');
        await expect(editor.locator('strong')).toContainText(
          'Проверка редактора'
        );
        await page
          .locator('[data-testid$="-MessageList-UserMessagesWrapper"]')
          .click({ position: { x: 8, y: 8 } });
        await expect(picker).toHaveCount(0);
        await emojiTrigger.click();
        await expect(picker).toBeVisible();
        expect(emojiRequests()).toHaveLength(1);
        expect(
          requests.filter(path => /_chat-ui-editor-runtime-/.test(path))
        ).toHaveLength(1);
        expect(errors).toEqual([]);
        results.push({ authenticated: true, mobile, requests, errors });

        // Новый документ, как при холодном входе по ссылке/уведомлению. История
        // уже готова, а лёгкий input-bootstrap виден, пока загружается редактор.
        let releaseEditor!: () => void;
        const editorGate = new Promise<void>(resolve => {
          releaseEditor = resolve;
        });
        let editorRequested = false;
        await page.route(
          '**/assets/_chat-ui-editor-runtime-*.js',
          async route => {
            editorRequested = true;
            await editorGate;
            await route.continue();
          }
        );
        await page.addInitScript(() => {
          (window as any).__composerStateAtFirstContent = null;
          window.addEventListener(
            'chat:native-startup-ready',
            () => {
              (window as any).__composerStateAtFirstContent = {
                editor: Boolean(
                  document.querySelector(
                    '.chat__input .ProseMirror[contenteditable="true"]'
                  )
                ),
                bootstrap: Boolean(
                  document.querySelector('.chat__input-bootstrap')
                )
              };
            },
            { once: true }
          );
        });
        try {
          await page.goto(
            `http://127.0.0.1:5195/dialogs/${fixture.topics[1].id}`
          );
          await expect.poll(() => editorRequested).toBe(true);
          await expect(
            page.locator('[data-message-id]').first()
          ).toBeAttached();
          await expect(page.locator('#startup-shell')).toHaveCount(0);
          await expect(page.locator('.chat__input .ProseMirror')).toHaveCount(
            0
          );
          await expect(page.locator('.chat__input-bootstrap')).toBeAttached();
          expect(
            await page
              .locator('.chat__input')
              .evaluate(element =>
                Math.round(element.getBoundingClientRect().height)
              )
          ).toBeGreaterThanOrEqual(75);
        } finally {
          releaseEditor();
        }
        await expect(page.locator('#startup-shell')).toHaveCount(0);
        await expect(page.locator('.chat__input-bootstrap')).toHaveCount(0);
        await expect(
          page.locator('.chat__input .ProseMirror[contenteditable="true"]')
        ).toBeVisible();
        expect(
          await page.evaluate(
            () => (window as any).__composerStateAtFirstContent
          )
        ).toEqual({ editor: false, bootstrap: true });
        expect(errors).toEqual([]);
        results.push({
          directTopic: true,
          mobile,
          firstContentIncludesEditor: true
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await fixture.close();
  }
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log(
    'Production startup: 4 сценария входа/темы, 2 сценария списка с открытием чата и 2 холодных входа с задержкой редактора прошли.'
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close(error => (error ? reject(error) : resolve()))
  );
}
