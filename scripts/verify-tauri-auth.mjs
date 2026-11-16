import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, expect } from '@playwright/test';

if (process.platform !== 'win32') {
  throw new Error('Эта проверка предназначена для Windows WebView2');
}

const root = path.resolve(import.meta.dirname, '..');
const api = 'http://127.0.0.1:5207';
const cdp = 'http://127.0.0.1:9226';
const frontend = 'http://localhost:5211';
const bun =
  process.env.BUN_EXECUTABLE ||
  (process.versions.bun
    ? process.execPath
    : [
        ...process.env.PATH.split(path.delimiter).map(directory =>
          path.join(directory, 'bun.exe')
        ),
        path.join(
          path.dirname(process.execPath),
          'node_modules/bun/bin/bun.exe'
        )
      ].find(existsSync) || 'bun.exe');
const fixture = await readFile(
  path.join(root, 'e2e/fixtures/tauri-auth.html'),
  'utf8'
);
const children = new Set();
let browser;
const errors = [];
const env = {
  ...process.env,
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
    '--remote-debugging-port=9226 --remote-debugging-address=127.0.0.1'
};

const start = (file, args) => {
  const child = spawn(file, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', data => (log = (log + data).slice(-4000)));
  child.stderr.on('data', data => (log = (log + data).slice(-4000)));
  child.on('error', error => {
    child.startError = error;
    errors.push(error.message);
  });
  child.log = () => log;
  children.add(child);
  return child;
};

const stop = async child => {
  if (!children.has(child)) return;
  if (child.pid && child.exitCode === null) {
    await new Promise((resolve, reject) => {
      const kill = spawn(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        {
          windowsHide: true,
          stdio: 'ignore'
        }
      );
      kill.once('error', reject);
      kill.once('exit', resolve);
    });
  }
  children.delete(child);
};

const getStatus = () => fetch(`${api}/__qa/status`).then(r => r.json());
const setUnavailable = unavailable =>
  fetch(`${api}/__qa/mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unavailable })
  });
const snapshot = page => page.evaluate(() => window.nativeAuthQa.snapshot());
const successes = status =>
  status.events.filter(e => e.action === 'refresh' && e.status === 200);
const waitForServer = async (url, child, timeout = 30_000) => {
  await expect
    .poll(
      async () => {
        if (child.startError) throw child.startError;
        if (child.exitCode !== null)
          throw new Error(`Процесс завершился: ${child.log()}`);
        return fetch(url).then(
          r => r.ok,
          () => false
        );
      },
      { timeout, intervals: [250, 500, 1000] }
    )
    .toBe(true);
};
const attach = async () => {
  browser = await chromium.connectOverCDP(cdp);
  const page = browser.contexts()[0].pages()[0];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(`${frontend}/`, route =>
    route.fulfill({ contentType: 'text/html; charset=utf-8', body: fixture })
  );
  await expect
    .poll(() => page.evaluate(() => !!window.nativeAuthQa).catch(() => false), {
      timeout: 30_000
    })
    .toBe(true);
  return page;
};

try {
  // Не подключаемся к чужим серверам или к уже открытому Tauri.
  for (const url of [api, cdp, frontend]) {
    assert.equal(
      await fetch(url).then(
        () => true,
        () => false
      ),
      false,
      `Порт уже занят: ${url}`
    );
  }
  const server = start(bun, ['e2e/fixtures/tauri-auth-server.ts']);
  const vite = start(bun, [
    'x',
    'vite',
    '--host',
    'localhost',
    '--port',
    '5211',
    '--strictPort'
  ]);
  await Promise.all([
    waitForServer(`${api}/__qa/status`, server),
    waitForServer(`${frontend}/e2e/fixtures/tauri-auth.html`, vite)
  ]);
  console.log('Запуск отдельного Tauri с локальной сессией…');
  const dev = start(bun, [
    'x',
    'tauri',
    'dev',
    '--no-watch',
    '--config',
    'e2e/fixtures/tauri-auth.config.json'
  ]);
  await waitForServer(`${cdp}/json/version`, dev, 300_000);
  let page = await attach();
  await page.evaluate(() => window.nativeAuthQa.login());
  const initial = await snapshot(page);
  assert.equal(initial.persistent, true);
  assert.equal(initial.accessCookieMatches, true);
  assert.equal(initial.refreshCookieVisible, false);
  assert.equal(initial.userMatches, true);

  await expect
    .poll(async () => successes(await getStatus()).length, { timeout: 15_000 })
    .toBeGreaterThanOrEqual(1);
  let status = await getStatus();
  const firstRefresh = successes(status)[0];
  assert.ok(firstRefresh.at < initial.expiresAt);
  assert.equal(firstRefresh.cookieMatched, true);
  await expect
    .poll(async () => (await snapshot(page)).generation)
    .toBe(firstRefresh.generation);
  console.log('Автоматическое продление до истечения токена прошло.');

  // Сбой длится до истечения access-cookie: восстановление использует сессию.
  await setUnavailable(true);
  const beforeOutage = await snapshot(page);
  await expect
    .poll(
      async () =>
        (await getStatus()).events.filter(e => e.status === 503).length,
      { timeout: 15_000 }
    )
    .toBeGreaterThanOrEqual(1);
  await expect
    .poll(() => Date.now(), { timeout: 15_000 })
    .toBeGreaterThan(beforeOutage.expiresAt + 1000);
  assert.equal((await snapshot(page)).stored, true);
  const successfulBeforeRecovery = successes(await getStatus()).length;
  await setUnavailable(false);
  await expect
    .poll(async () => successes(await getStatus()).length, { timeout: 15_000 })
    .toBeGreaterThan(successfulBeforeRecovery);
  await expect
    .poll(async () => (await snapshot(page)).generation)
    .toBeGreaterThan(beforeOutage.generation);
  const recovered = await snapshot(page);
  assert.equal(recovered.accessCookieMatches, true);
  assert.equal(recovered.userMatches, true);
  console.log('Временный HTTP 503 сохранил вход; таймер восстановил сессию.');

  await page.evaluate(() => void window.nativeAuthQa.quit());
  await expect
    .poll(
      () =>
        fetch(`${cdp}/json/version`).then(
          () => true,
          () => false
        ),
      { timeout: 15_000 }
    )
    .toBe(false);
  await expect.poll(() => dev.exitCode, { timeout: 15_000 }).not.toBeNull();
  await browser.close();
  browser = undefined;
  await stop(dev);
  const beforeRestart = successes(await getStatus()).length;
  // Пауза покрывает срок JWT, но не срок настоящей HttpOnly-cookie WebView2.
  await expect
    .poll(() => Date.now(), { timeout: 15_000 })
    .toBeGreaterThan(recovered.expiresAt + 500);
  const executable = path.join(
    process.env.CARGO_TARGET_DIR || path.join(root, 'src-tauri/target'),
    'debug/sep-chat.exe'
  );
  const restarted = start(executable, []);
  await waitForServer(`${cdp}/json/version`, restarted);
  page = await attach();
  await expect
    .poll(async () => successes(await getStatus()).length, { timeout: 15_000 })
    .toBeGreaterThan(beforeRestart);
  const restored = await snapshot(page);
  assert.equal(restored.persistent, true);
  assert.equal(restored.accessCookieMatches, true);
  assert.equal(restored.refreshCookieVisible, false);
  assert.equal(restored.userMatches, true);
  console.log('Перезапуск с истёкшим access-токеном сохранил вход.');

  await page.evaluate(() => void window.nativeAuthQa.logout());
  await expect.poll(() => page.url()).toBe(`${frontend}/`);
  await expect
    .poll(() => page.evaluate(() => !!window.nativeAuthQa))
    .toBe(true);
  assert.equal((await snapshot(page)).stored, false);
  assert.equal(
    await page.evaluate(() => window.nativeAuthQa.refreshStatus()),
    401
  );
  status = await getStatus();
  const logout = status.events.find(e => e.action === 'logout');
  assert.equal(logout?.status, 204);
  assert.equal(logout?.cookieMatched, true);
  assert.equal(status.events.at(-1).cookieMatched, false);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      realWebView2: true,
      automaticRefreshes: successes(status).length,
      transientFailures: status.events.filter(e => e.status === 503).length,
      restartWithExpiredToken: true,
      logoutRevokedCookie: true,
      pageErrors: errors.length
    })
  );
} catch (error) {
  console.error(
    'Диагностика локальной проверки:',
    await getStatus().catch(() => null)
  );
  for (const context of browser?.contexts() || []) {
    for (const page of context.pages()) {
      console.error({
        url: page.url(),
        snapshot: await snapshot(page).catch(() => null)
      });
    }
  }
  throw error;
} finally {
  await browser?.close();
  for (const child of [...children].reverse()) await stop(child);
}
