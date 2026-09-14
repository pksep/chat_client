import {
  _android,
  chromium,
  expect,
  type Page,
  type Browser,
  type CDPSession
} from 'playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAndroidPerformanceServer } from '../e2e/fixtures/android-performance-server.ts';

const execute = promisify(execFile);
const serial = process.env.ANDROID_PERFORMANCE_SERIAL || 'emulator-5556';
const packageId = process.env.ANDROID_PERFORMANCE_PACKAGE || 'sep.pksep.app';
const isEmulator = serial.startsWith('emulator-');
if (
  !['sep.pksep.app', 'sep.pksep.app.performance'].includes(packageId) ||
  (!isEmulator && packageId !== 'sep.pksep.app.performance')
)
  throw new Error(
    'На телефоне стенд разрешён только для отдельного пакета sep.pksep.app.performance'
  );
const mainActivity = `${packageId}/sep.pksep.app.MainActivity`;
const notificationReceiver = `${packageId}/sep.pksep.app.PerformanceNotificationReceiver`;
const sdk =
  process.env.ANDROID_HOME || resolve(process.env.LOCALAPPDATA!, 'Android/Sdk');
const adbPath = resolve(
  sdk,
  'platform-tools',
  process.platform === 'win32' ? 'adb.exe' : 'adb'
);
const adb = async (...args: string[]) =>
  (
    await execute(adbPath, ['-s', serial, ...args], {
      timeout: 60_000,
      windowsHide: true
    })
  ).stdout;
const phase = process.env.ANDROID_PERFORMANCE_PHASE || 'local';
const cacheLayout =
  process.env.ANDROID_PERFORMANCE_CACHE === 'shadow' ? 'shadow' : 'legacy';
const isBaseline = process.env.ANDROID_PERFORMANCE_BASELINE === '1';
if (isBaseline && process.env.ANDROID_PERFORMANCE_ASSERT_STARTUP === '1')
  throw new Error(
    'Для проверки новой сборки отключите ANDROID_PERFORMANCE_BASELINE'
  );
const output = resolve(`../artifacts/chat-294-android-${phase}`);
await mkdir(output, { recursive: true });
const installedPackage = await adb('shell', 'dumpsys', 'package', packageId);
const installedReceiver = await adb(
  'shell',
  'cmd',
  'package',
  'query-receivers',
  '--components',
  '-n',
  notificationReceiver
);
if (
  !installedPackage.includes('DEBUGGABLE') ||
  ![notificationReceiver, `${packageId}/.PerformanceNotificationReceiver`].some(
    component => installedReceiver.includes(component)
  )
)
  throw new Error(
    'Установите отладочную APK с тестовым приёмником уведомлений'
  );
// Нагрузочный прогон публикует десятки системных уведомлений. На выделенном
// AVD звук не нужен и мешает локальной работе рядом с Android Studio.
await Promise.allSettled(
  ['2', '3', '5'].map(stream =>
    adb(
      'shell',
      'cmd',
      'media_session',
      'volume',
      '--stream',
      stream,
      '--set',
      '0'
    )
  )
);
const fixture = await createAndroidPerformanceServer({
  topicCount: Number(process.env.ANDROID_PERFORMANCE_TOPIC_COUNT || 12)
});
const devices = isEmulator ? await _android.devices() : [];
const device = devices.find(candidate => candidate.serial() === serial);
if (isEmulator && !device)
  throw new Error(`Тестовое устройство ${serial} не найдено`);
device?.setDefaultTimeout(10_000);
const results: unknown[] = [];
const externalRequests = new Set<string>();
const pageErrors: string[] = [];
let page: Page;
const browsers: Browser[] = [];
let startupProfiler: CDPSession | null = null;
const saveDeviceScreenshot = async (name: string): Promise<void> => {
  const { stdout } = await execute(
    adbPath,
    ['-s', serial, 'exec-out', 'screencap', '-p'],
    {
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
      windowsHide: true
    }
  );
  await writeFile(resolve(output, name), stdout);
};
const connectPage = async () => {
  const deadline = Date.now() + 30_000;
  let pid = 0;
  while (!pid && Date.now() < deadline) {
    try {
      pid = Number(
        (await adb('shell', 'pidof', packageId)).trim().split(' ')[0]
      );
    } catch {}
    if (!pid) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!pid) throw new Error('Процесс тестового APK не запустился');
  await adb(
    'forward',
    'tcp:9228',
    `localabstract:webview_devtools_remote_${pid}`
  );
  let endpoint = '';
  while (!endpoint && Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:9228/json/version');
      endpoint = (await response.json()).webSocketDebuggerUrl;
    } catch {}
    if (!endpoint) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!endpoint) throw new Error('WebView не открыл отладочный сокет');
  const browser = await chromium.connectOverCDP(endpoint, {
    timeout: 30_000,
    noDefaults: true
  });
  browsers.push(browser);
  const connected = browser.contexts()[0].pages()[0];
  if (process.env.ANDROID_PERFORMANCE_PROFILE === '1') {
    startupProfiler = await browser.contexts()[0].newCDPSession(connected);
    await startupProfiler.send('Profiler.enable');
    await startupProfiler.send('Profiler.start');
  }
  connected.setDefaultTimeout(30_000);
  console.log('Подключён WebView', pid, connected.url());
  connected.on('pageerror', error => pageErrors.push(error.message));
  // Локальные APK-ресурсы не гоняем через Node: это добавляло задержку стенда.
  await connected.route(
    /^https?:\/\/(?!(?:localhost|127\.0\.0\.1)(?::|\/))/,
    route => {
      const url = new URL(route.request().url());
      externalRequests.add(`${url.origin}${url.pathname}`);
      return route.abort();
    }
  );
  await connected.locator('#app').waitFor({ state: 'attached' });
  return connected;
};
const observe = async (connected: Page, targetIndex?: number) => {
  const target =
    targetIndex === undefined
      ? null
      : {
          topicId: fixture.topics[targetIndex].id,
          messageId: fixture.histories
            .get(fixture.topics[targetIndex].id)!
            .at(-1)!.id
        };
  await connected.evaluate(target => {
    if ((window as any).__androidPerformance)
      (window as any).__androidPerformance.stopped = true;
    const state = {
      skeletonFrames: 0,
      frames: 0,
      maxMessageNodes: 0,
      started: performance.now(),
      stopped: false,
      routeStartedAt: null as number | null,
      firstReadyAt: null as number | null,
      routeToReadyMs: null as number | null,
      wrongTopicFrames: 0,
      cacheWrites: [] as Array<{
        source: string;
        messages: number;
        startedAt: number;
        queuedAt: number;
        committedAt?: number;
        abortedAt?: number;
      }>,
      cacheReads: [] as Array<{
        store: string;
        key: string | null;
        startedAt: number;
      }>,
      targetTopicId: target?.topicId,
      timingSource: 'frame'
    };
    (window as any).__androidPerformance = state;
    if (!(window as any).__androidCacheReadsObserved) {
      (window as any).__androidCacheReadsObserved = true;
      for (const method of ['get', 'getAll'] as const) {
        const original = IDBObjectStore.prototype[method];
        IDBObjectStore.prototype[method] = function (...args) {
          const current = (window as any).__androidPerformance;
          if (current && !current.stopped)
            current.cacheReads.push({
              store: this.name,
              key: typeof args[0] === 'string' ? args[0] : null,
              startedAt: performance.now()
            });
          return original.apply(this, args);
        };
      }
    }
    if (!(window as any).__androidCacheWritesObserved) {
      (window as any).__androidCacheWritesObserved = true;
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const current = (window as any).__androidPerformance;
        if (this.name !== 'topicSnapshots' || !current || current.stopped)
          return put.apply(this, args);
        const startedAt = performance.now();
        const request = put.apply(this, args);
        const sample = {
          source: args[0]?.source || '',
          messages: args[0]?.messages?.length || 0,
          startedAt,
          queuedAt: performance.now(),
          committedAt: undefined as number | undefined,
          abortedAt: undefined as number | undefined
        };
        current.cacheWrites.push(sample);
        this.transaction.addEventListener(
          'complete',
          () => {
            sample.committedAt = performance.now();
          },
          { once: true }
        );
        this.transaction.addEventListener(
          'abort',
          () => {
            sample.abortedAt = performance.now();
          },
          { once: true }
        );
        return request;
      };
    }
    if (!(window as any).__androidHistoryObserved) {
      (window as any).__androidHistoryObserved = true;
      for (const method of ['pushState', 'replaceState'] as const) {
        const original = history[method].bind(history);
        history[method] = (...args) => {
          const current = (window as any).__androidPerformance;
          if (
            args[2] &&
            current?.targetTopicId &&
            new URL(String(args[2]), location.href).pathname.endsWith(
              current.targetTopicId
            )
          ) {
            current.routeStartedAt ??= performance.now();
            current.timingSource = 'history';
          }
          return original(...args);
        };
      }
    }
    const frame = () => {
      if (state.stopped) return;
      state.frames++;
      if (
        document.querySelector(
          '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
        )
      )
        state.skeletonFrames++;
      state.maxMessageNodes = Math.max(
        state.maxMessageNodes,
        document.querySelectorAll('[data-message-id]').length
      );
      if (
        !target &&
        state.firstReadyAt === null &&
        !document.querySelector('#startup-shell')
      ) {
        const listReady = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-testid*="-ContactList-Item"]'
          )
        ].some(node => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top < innerHeight &&
            rect.bottom > 0
          );
        });
        if (listReady) state.firstReadyAt = performance.now();
      }
      if (target && location.pathname.endsWith(target.topicId)) {
        state.routeStartedAt ??= performance.now();
        const nodes = [
          ...document.querySelectorAll<HTMLElement>('[data-message-id]')
        ];
        const visible = nodes.filter(node => {
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top < innerHeight &&
            rect.bottom > 0
          );
        });
        if (
          visible.some(
            node =>
              !node.dataset.messageId?.startsWith(target.messageId.slice(0, -5))
          )
        )
          state.wrongTopicFrames++;
        if (
          visible.some(node => node.dataset.messageId === target.messageId) &&
          !document.querySelector(
            '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
          )
        ) {
          state.firstReadyAt ??= performance.now();
          state.routeToReadyMs = state.firstReadyAt - state.routeStartedAt;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }, target);
};
const capture = async (
  name: string,
  started: number,
  requestIndex: number,
  extra = {}
) => {
  if (startupProfiler) {
    const { profile } = await startupProfiler.send('Profiler.stop');
    await writeFile(
      resolve(output, `${name}.cpuprofile`),
      JSON.stringify(profile)
    );
    await startupProfiler.detach();
    startupProfiler = null;
  }
  const result = {
    name,
    elapsedMs: performance.now() - started,
    ...(await page.evaluate(() => {
      const state = (window as any).__androidPerformance;
      if (state) state.stopped = true;
      return {
        ...state,
        startupMarks: performance
          .getEntriesByType('mark')
          .filter(entry => entry.name.startsWith('chat-startup:'))
          .map(entry => ({ name: entry.name, at: entry.startTime })),
        resources: performance
          .getEntriesByType('resource')
          .filter(entry => /\.(js|css|woff2?)(\?|$)/.test(entry.name))
          .map(entry => ({
            name: new URL(entry.name).pathname,
            start: entry.startTime,
            duration: entry.duration
          })),
        url: location.pathname,
        navigationMs: performance.now(),
        messageCount: document.querySelectorAll('[data-message-id]').length,
        shellVisible: !!document.querySelector('#startup-shell')
      };
    })),
    requests: fixture.requests.slice(requestIndex),
    ...extra
  };
  results.push(result);
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(
      {
        cacheLayout,
        results,
        pageErrors,
        connections: fixture.connections,
        externalRequests: [...externalRequests]
      },
      null,
      2
    )
  );
  console.log(
    JSON.stringify({
      ...result,
      resources: undefined,
      requests: result.requests.map(
        request => `${request.method} ${request.path}`
      )
    })
  );
  return result;
};
const waitForTopic = async (index: number) => {
  const topic = fixture.topics[index];
  const last = fixture.histories.get(topic.id)!.at(-1)!;
  await expect(
    page.locator(`[data-message-id="${last.id}"]`).first()
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#startup-shell')).toHaveCount(0);
  await expect(
    page.locator('[data-testid$="-MessageList-Skeleton"]')
  ).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/dialogs/${topic.id}`));
};
const publish = async (index: number, messageIndex = 4999) => {
  const topic = fixture.topics[index];
  const message = fixture.histories.get(topic.id)![messageIndex];
  await adb(
    'shell',
    'am',
    'broadcast',
    '--include-stopped-packages',
    '-n',
    notificationReceiver,
    '--es',
    'topicId',
    topic.id,
    '--es',
    'messageId',
    message.id
  );
};
let lastNativeTapAt = 0;
const tap = async (index: number) => {
  let bounds;
  for (let attempt = 0; attempt < 3 && !bounds; attempt++) {
    await adb('shell', 'cmd', 'statusbar', 'expand-notifications');
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      if (device)
        bounds = (
          await device.info({
            text: `CHAT-294 ${String(index).padStart(2, '0')}`
          })
        ).bounds;
      else {
        // Штатный UIAutomator не требует установки драйвера на личный телефон.
        await adb(
          'shell',
          'uiautomator',
          'dump',
          '/data/local/tmp/chat294-notification.xml'
        );
        const xml = await adb(
          'shell',
          'cat',
          '/data/local/tmp/chat294-notification.xml'
        );
        const title = `CHAT-294 ${String(index).padStart(2, '0')}`;
        const node = xml.match(
          new RegExp(`<node[^>]*text="${title}"[^>]*>`)
        )?.[0];
        const box = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (box)
          bounds = {
            x: +box[1],
            y: +box[2],
            width: +box[3] - +box[1],
            height: +box[4] - +box[2]
          };
      }
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  if (!bounds) throw new Error('Не найдено тестовое уведомление');
  lastNativeTapAt = performance.now();
  await adb(
    'shell',
    'input',
    'tap',
    String(Math.round(bounds.x + bounds.width / 2)),
    String(Math.round(bounds.y + bounds.height / 2))
  );
  console.log('Нажато уведомление', index);
};

try {
  await adb('reverse', 'tcp:5188', 'tcp:5188');
  // Изолированный тестовый AVD: каждый прогон начинается с одинаковых данных.
  await adb('shell', 'am', 'force-stop', packageId);
  await adb('shell', 'pm', 'clear', packageId);
  await adb(
    'shell',
    'pm',
    'grant',
    packageId,
    'android.permission.POST_NOTIFICATIONS'
  );
  await adb('shell', 'am', 'force-stop', packageId);
  const firstInstallStarted = performance.now();
  await adb('shell', 'am', 'start', '-n', mainActivity);
  page = await connectPage();
  await expect(page.getByRole('heading', { name: 'Вход в ЧАТ' })).toBeVisible({
    timeout: 30_000
  });
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await writeFile(
    resolve(output, 'first-install.json'),
    JSON.stringify(
      {
        processStartToObservedReadyMs: performance.now() - firstInstallStarted,
        ...(await page.evaluate(() => ({
          // Отметка снятия оболочки, без задержки подключения тестового наблюдателя.
          shellRemovedFromWebViewMs: performance
            .getEntriesByName('chat-startup:shell-removed')
            .at(-1)?.startTime,
          startupMarks: performance
            .getEntriesByType('mark')
            .filter(row => row.name.startsWith('chat-startup:'))
            .map(row => ({ name: row.name, at: row.startTime })),
          resources: performance
            .getEntriesByType('resource')
            .filter(row => /\.(js|css)(\?|$)/.test(row.name))
            .map(row => ({
              name: new URL(row.name).pathname,
              start: row.startTime,
              duration: row.duration
            }))
        })))
      },
      null,
      2
    )
  );
  await saveDeviceScreenshot('first-install.png');
  await page.evaluate(
    async ({ origin, config, user, users, topics, histories, cacheLayout }) => {
      localStorage.setItem(
        'chat_auth_session',
        JSON.stringify({ token: 'chat-294-local-fixture', user })
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
      localStorage.setItem('chat_wallpaper_selection_v2', 'none');
      localStorage.setItem(
        'chat.indexeddb.reset.done',
        'chat-client-indexeddb-reset-2026-04-29-v1'
      );
      const writeDb = (
        name: string,
        version: number,
        stores: string[],
        rows: Record<string, unknown[]>
      ) =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(name, version);
          request.onupgradeneeded = () => {
            for (const store of stores)
              if (!request.result.objectStoreNames.contains(store))
                request.result.createObjectStore(store, {
                  keyPath:
                    store === 'eventLog'
                      ? 'id'
                      : store === 'syncMeta'
                        ? 'key'
                        : store === 'pendingUploadChunks'
                          ? ['cacheKey', 'chunkIndex']
                          : 'cacheKey'
                });
          };
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction(Object.keys(rows), 'readwrite');
            for (const [store, items] of Object.entries(rows))
              for (const item of items)
                transaction.objectStore(store).put(item);
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = () => {
              db.close();
              reject(transaction.error);
            };
          };
        });
      await writeDb('chat-offline-state-db', 2, ['entities'], {
        entities: [
          {
            cacheKey: `${user.id}:users`,
            userId: user.id,
            type: 'users',
            items: users,
            updatedAt: new Date().toISOString()
          },
          {
            cacheKey: `${user.id}:topics`,
            userId: user.id,
            type: 'topics',
            items: topics,
            updatedAt: new Date().toISOString()
          }
        ]
      });
      await writeDb(
        'chat-topic-messages-db',
        6,
        [
          'topicMessages',
          'pinnedMessages',
          'pendingUploads',
          'pendingUploadMeta',
          'pendingUploadChunks'
        ],
        {
          topicMessages: (cacheLayout === 'legacy' ? histories : []).map(
            ([topicId, messages]) => ({
              cacheKey: `${user.id}:${topicId}`,
              userId: user.id,
              topicId,
              messages,
              updatedAt: new Date().toISOString()
            })
          )
        }
      );
      if (cacheLayout === 'shadow') {
        await writeDb(
          'chat-sync-shadow-db',
          2,
          ['eventLog', 'topicSnapshots', 'readStates', 'syncMeta'],
          {
            topicSnapshots: histories.map(([topicId, messages]) => ({
              cacheKey: `${user.id}:${topicId}`,
              userId: user.id,
              topicId,
              messages,
              updatedAt: new Date().toISOString(),
              source: 'local'
            })),
            readStates: histories.map(([topicId, messages]) => ({
              cacheKey: `${user.id}:${topicId}`,
              userId: user.id,
              topicId,
              lastReadMessageId: messages.at(-1)!.id,
              lastReadAt: messages.at(-1)!.createdAt,
              updatedAt: new Date().toISOString(),
              source: 'local'
            }))
          }
        );
      }
    },
    {
      origin: fixture.origin,
      config: fixture.config,
      user: fixture.user,
      users: fixture.users,
      topics: fixture.topics,
      cacheLayout,
      histories: [...fixture.histories].slice(0, 3)
    }
  );
  console.log('Тестовая сессия и кеш готовы');
  // WebView сохраняет localStorage на диск асинхронно; это подготовка, вне замера.
  await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  await page.waitForTimeout(5000);
  fixture.latency.users = 2500;
  fixture.latency.topics = 2500;
  await adb('shell', 'am', 'force-stop', packageId);
  let requestIndex = fixture.requests.length;
  let started = performance.now();
  await adb('shell', 'am', 'start', '-n', mainActivity);
  page = await connectPage();
  await observe(page);
  await expect(
    page.locator('[data-testid*="-ContactList-Item"]:visible').first()
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('#startup-shell')).toHaveCount(0, {
    timeout: 30_000
  });
  await capture('cold-list-slow-directory', started, requestIndex);
  await saveDeviceScreenshot('cold-list.png');
  fixture.latency.users = 0;
  fixture.latency.topics = 0;
  fixture.latency.messages = 1200;
  fixture.latency.around = 1200;
  if (isEmulator) {
    await adb('shell', 'am', 'force-stop', packageId);
    await publish(1);
  } else {
    await publish(1);
    await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Xiaomi блокирует broadcast после force-stop; сохраняем настоящий PendingIntent.
    await adb('shell', 'am', 'kill', packageId);
    let alive = '';
    try {
      alive = (await adb('shell', 'pidof', packageId)).trim();
    } catch {}
    expect(
      alive,
      'Процесс перед холодным уведомлением должен завершиться'
    ).toBe('');
  }
  requestIndex = fixture.requests.length;
  started = performance.now();
  await tap(1);
  page = await connectPage();
  await observe(page, 1);
  await waitForTopic(1);
  await capture('cold-notification-cached-slow-network', started, requestIndex);
  await saveDeviceScreenshot('cold-notification.png');
  // Завершить обновление списка после холодного запуска до отдельного тёплого сценария.
  await page.waitForTimeout(4000);
  await publish(2);
  await observe(page, 2);
  requestIndex = fixture.requests.length;
  started = performance.now();
  await tap(2);
  await waitForTopic(2);
  await capture('warm-notification-cached-slow-network', started, requestIndex);
  if (process.env.ANDROID_PERFORMANCE_TOPICS === '1') {
    fixture.latency.messages = 0;
    const samples: any[] = [];
    for (let iteration = 0; iteration < 20; iteration++) {
      const index = (iteration % 2) + 1;
      await page.locator('[data-testid$="-Header-BackButton"]').click();
      const item = page
        .locator('[data-testid*="-ContactList-Item"]:visible')
        .filter({ hasText: `Сотрудник ${index + 1}` })
        .first();
      await expect(item).toBeVisible({ timeout: 15_000 });
      await observe(page, index);
      requestIndex = fixture.requests.length;
      started = performance.now();
      await item.click();
      await waitForTopic(index);
      const result = await capture(
        `topic-switch-${iteration + 1}`,
        started,
        requestIndex
      );
      expect(result.skeletonFrames).toBe(0);
      expect(result.wrongTopicFrames).toBe(0);
      expect(result.maxMessageNodes).toBeLessThanOrEqual(72);
      expect(
        result.requests.filter(request =>
          /^\/api\/(users\?|topics\?)/.test(request.path)
        )
      ).toHaveLength(0);
      // Baseline записывает прежние повторные загрузки; новая сборка обязана
      // пройти ограничение одного запроса истории после истечения TTL.
      if (!isBaseline)
        expect(
          result.requests.filter(
            request =>
              /\/messages\//.test(request.path) &&
              !request.path.endsWith('/pinned')
          ).length
        ).toBeLessThanOrEqual(1);
      samples.push(result);
    }
    const times = samples
      .map(sample => sample.routeToReadyMs)
      .sort((a, b) => a - b);
    await writeFile(
      resolve(output, 'topic-switch-summary.json'),
      JSON.stringify(
        {
          count: samples.length,
          p50Ms: times[Math.floor(times.length * 0.5)],
          p95Ms: times[Math.ceil(times.length * 0.95) - 1],
          skeletonFrames: samples.reduce(
            (sum, sample) => sum + sample.skeletonFrames,
            0
          ),
          requests: samples.flatMap(sample => sample.requests)
        },
        null,
        2
      )
    );
    if (process.env.ANDROID_PERFORMANCE_ASSERT_STARTUP === '1') {
      await expect(page.locator('.chat__menu')).toHaveCount(0);
      const unnecessary = await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map(entry => entry.name)
          .filter(name =>
            /\/(?:NewContactModal|NewBotModal|NewGroupModal|calls-livekit|calls-mediapipe|useLiveKit)-/.test(
              name
            )
          )
      );
      expect(unnecessary).toEqual([]);
      const uploadWorkers = await page.evaluate(async () => ({
        supported: 'serviceWorker' in navigator,
        scopes:
          'serviceWorker' in navigator
            ? (await navigator.serviceWorker.getRegistrations())
                .map(registration => registration.scope)
                .filter(scope => scope.includes('/pending-upload-cache-'))
            : []
      }));
      await writeFile(
        resolve(output, 'startup-upload-workers.json'),
        JSON.stringify(uploadWorkers, null, 2)
      );
      expect(uploadWorkers.scopes).toEqual([]);
    }
  }
  if (process.env.ANDROID_PERFORMANCE_STRESS === '1') {
    await page.waitForTimeout(4000);
    await expect.poll(() => fixture.io.engine.clientsCount).toBe(1);
    const samples: any[] = [];
    const iterations = Number(process.env.ANDROID_PERFORMANCE_ITERATIONS || 20);
    for (let iteration = 0; iteration < iterations; iteration++) {
      const index = (iteration % 2) + 1;
      await publish(index, iteration % 3 === 0 ? 0 : 4999);
      requestIndex = fixture.requests.length;
      const connectionIndex = fixture.connections.length;
      await observe(page, index);
      started = performance.now();
      await tap(index);
      await waitForTopic(index);
      const paintElapsedMs = performance.now() - started;
      const tapToVisibleMs = performance.now() - lastNativeTapAt;
      await page.waitForTimeout(2700);
      const sample = await capture(
        `notification-stress-${iteration + 1}`,
        started,
        requestIndex,
        { paintElapsedMs, tapToVisibleMs }
      );
      samples.push(sample);
      const paths = sample.requests.map(request => request.path);
      expect(
        paths.filter(path => path.includes('newMessages=true'))
      ).toHaveLength(1);
      expect(
        paths.filter(path => path.includes('/around')).length
      ).toBeLessThanOrEqual(iteration % 3 === 0 ? 1 : 0);
      expect(
        paths.filter(path => path.includes('afterMessageId'))
      ).toHaveLength(0);
      expect(
        paths.filter(path => /^\/api\/(users\?|topics\?)/.test(path))
      ).toHaveLength(0);
      expect(fixture.connections.slice(connectionIndex)).toEqual([]);
      expect(sample.skeletonFrames).toBe(0);
      expect(sample.wrongTopicFrames).toBe(0);
      expect(sample.maxMessageNodes).toBeLessThanOrEqual(72);
    }
    fixture.state.failMessages = true;
    const cachedFailureIndex = iterations % 2 === 0 ? 1 : 2;
    await publish(cachedFailureIndex);
    requestIndex = fixture.requests.length;
    await observe(page, cachedFailureIndex);
    started = performance.now();
    await tap(cachedFailureIndex);
    await waitForTopic(cachedFailureIndex);
    await page.waitForTimeout(1700);
    const offline = await capture(
      'cached-notification-http-503',
      started,
      requestIndex
    );
    expect(offline.skeletonFrames).toBe(0);
    expect(
      offline.requests.filter(request =>
        request.path.includes('newMessages=true')
      )
    ).toHaveLength(1);
    fixture.state.failMessages = false;
    fixture.state.lagLatest = true;
    await publish(4);
    requestIndex = fixture.requests.length;
    await observe(page, 4);
    started = performance.now();
    await tap(4);
    await waitForTopic(4);
    const lag = await capture(
      'uncached-notification-lagging-latest',
      started,
      requestIndex
    );
    expect(
      lag.requests.filter(request => request.path.endsWith('/around'))
    ).toHaveLength(1);
    expect(
      lag.requests.filter(request => request.path.includes('afterMessageId'))
    ).toHaveLength(0);
    expect(lag.maxMessageNodes).toBeLessThanOrEqual(72);
    fixture.state.lagLatest = false;
    fixture.latency.messages = fixture.latency.around = 0;
    await page.waitForTimeout(2500);
    requestIndex = fixture.requests.length;
    const connectionIndex = fixture.connections.length;
    started = performance.now();
    await observe(page, 4);
    await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await new Promise(resolve => setTimeout(resolve, 1500));
    await adb('shell', 'am', 'start', '-n', mainActivity);
    await waitForTopic(4);
    await page.waitForTimeout(1200);
    const resume = await capture(
      'short-background-resume',
      started,
      requestIndex
    );
    expect(
      resume.requests.filter(request =>
        /^\/api\/(users\?|topics[/?]|messages\/)/.test(request.path)
      )
    ).toHaveLength(0);
    expect(fixture.connections.slice(connectionIndex)).toEqual([]);
    fixture.latency.messages = 3000;
    requestIndex = fixture.requests.length;
    started = performance.now();
    await observe(page, 2);
    for (const index of [1, 4, 2]) {
      await adb(
        'shell',
        'am',
        'start',
        '-n',
        mainActivity,
        '-a',
        'sep.pksep.app.action.OPEN_CHAT_NOTIFICATION',
        '--es',
        'topicId',
        fixture.topics[index].id,
        '--es',
        'topicType',
        'DM',
        '--es',
        'messageId',
        fixture.histories.get(fixture.topics[index].id)!.at(-1)!.id
      );
    }
    await waitForTopic(2);
    await page.waitForTimeout(3500);
    await waitForTopic(2);
    const rapid = await capture(
      'three-notification-intents-latest-wins',
      started,
      requestIndex
    );
    expect(rapid.skeletonFrames).toBe(0);
    expect(rapid.wrongTopicFrames).toBe(0);
    expect(rapid.maxMessageNodes).toBeLessThanOrEqual(72);
    fixture.latency.messages = 0;
    await publish(4);
    await tap(4);
    await waitForTopic(4);
    await page.waitForTimeout(1200);
    const topic = fixture.topics[4];
    const history = fixture.histories.get(topic.id)!;
    const countBefore = history.length;
    const template = history.at(-1)!;
    const burst = Array.from({ length: 300 }, (_, index) => ({
      ...template,
      id: `29410000-0000-4000-8000-${String(4 * 100000 + countBefore + index).padStart(12, '0')}`,
      text: `Нагрузка: сообщение ${index}`,
      createdAt: new Date(
        Date.parse(template.createdAt) + (index + 1) * 1000
      ).toISOString()
    }));
    history.push(...burst);
    topic.lastMessage = history.at(-1);
    await observe(page, 4);
    requestIndex = fixture.requests.length;
    started = performance.now();
    for (const [index, message] of burst.entries())
      fixture.io.emit('changeMessage', {
        type: 'NEW',
        topicId: topic.id,
        data: message,
        ptsMeta: {
          topicId: topic.id,
          pts: String(index + 1),
          eventId: `chat-294-burst-${index}`
        }
      });
    await waitForTopic(4);
    const burstResult = await capture(
      'websocket-burst-300-messages',
      started,
      requestIndex
    );
    expect(burstResult.maxMessageNodes).toBeLessThanOrEqual(72);
    expect(burstResult.skeletonFrames).toBe(0);
    expect(burstResult.elapsedMs).toBeLessThan(10_000);
    expect(
      burstResult.requests.filter(request =>
        request.path.includes('/messages/')
      )
    ).toHaveLength(0);
    await page.waitForTimeout(1500);
    await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    fixture.io.disconnectSockets(true);
    await new Promise(resolve => setTimeout(resolve, 1500));
    requestIndex = fixture.requests.length;
    started = performance.now();
    await observe(page, 4);
    await adb('shell', 'am', 'start', '-n', mainActivity);
    await waitForTopic(4);
    await expect
      .poll(() => fixture.io.engine.clientsCount, { timeout: 15_000 })
      .toBe(1);
    await expect
      .poll(
        () =>
          fixture.requests
            .slice(requestIndex)
            .some(request => request.path.includes('newMessages=true')),
        { timeout: 20_000 }
      )
      .toBe(true);
    // Дождаться этапа истории, затем проверить, что второй цикл не стартовал.
    await page.waitForTimeout(4000);
    const recovery = await capture(
      'background-disconnected-socket-recovery',
      started,
      requestIndex
    );
    const recoveryPaths = recovery.requests.map(request => request.path);
    for (const pattern of [
      /^\/api\/users\?/,
      /^\/api\/topics\?.*limit=999/,
      /\/pinned$/,
      /newMessages=true/
    ]) {
      expect(recoveryPaths.filter(path => pattern.test(path))).toHaveLength(1);
    }
    expect(recovery.skeletonFrames).toBe(0);
    expect(recovery.wrongTopicFrames).toBe(0);
    const sorted = samples
      .map(sample => sample.routeToReadyMs)
      .sort((a, b) => a - b);
    await writeFile(
      resolve(output, 'stress-summary.json'),
      JSON.stringify(
        {
          notifications: samples.length,
          routeToReadyP95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
          skeletonFrames: samples.reduce(
            (sum, sample) => sum + sample.skeletonFrames,
            0
          ),
          maxMessageNodes: Math.max(
            ...samples.map(sample => sample.maxMessageNodes)
          ),
          pageErrors,
          connections: fixture.connections
        },
        null,
        2
      )
    );
    expect(pageErrors).toEqual([]);
  }
  if (process.env.ANDROID_PERFORMANCE_FIRST_LIST === '1') {
    // Новая установка исключает восстановление списка отложенными записями
    // предыдущего сеанса или native-фоновой синхронизацией.
    await adb('shell', 'am', 'force-stop', packageId);
    await adb('shell', 'pm', 'clear', packageId);
    await adb(
      'shell',
      'pm',
      'grant',
      packageId,
      'android.permission.POST_NOTIFICATIONS'
    );
    await adb('shell', 'am', 'start', '-n', mainActivity);
    page = await connectPage();
    await expect(page.getByRole('heading', { name: 'Вход в ЧАТ' })).toBeVisible(
      { timeout: 30_000 }
    );
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    await page.evaluate(
      ({ user, config, origin }) => {
        localStorage.setItem(
          'chat_auth_session',
          JSON.stringify({ token: 'chat-294-local-fixture', user })
        );
        localStorage.setItem(
          'chat_runtime_organizations',
          JSON.stringify([{ url: origin, config }])
        );
        localStorage.setItem('chat_runtime_last_organization', origin);
        localStorage.setItem(
          'chat.indexeddb.reset.done',
          'chat-client-indexeddb-reset-2026-04-29-v1'
        );
      },
      { user: fixture.user, config: fixture.config, origin: fixture.origin }
    );
    await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
    await page.waitForTimeout(5000);
    fixture.state.missingFavorite = true;
    fixture.state.favoriteCreatedAt = null;
    fixture.latency.favorite = 5000;
    fixture.latency.topics = 1200;
    fixture.latency.users = 2500;
    await adb('shell', 'am', 'force-stop', packageId);
    requestIndex = fixture.requests.length;
    started = performance.now();
    await adb('shell', 'am', 'start', '-n', mainActivity);
    page = await connectPage();
    await observe(page);
    await expect(
      page.locator('[data-testid*="-ContactList-Item"]:visible').first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#startup-shell')).toHaveCount(0, {
      timeout: 30_000
    });
    // Часы Android и хоста могут расходиться; связываем монотонный возраст
    // отметки с серединой CDP round trip вместо сравнения двух Date.now().
    const calibrationStartedAt = Date.now();
    const shellAgeMs = await page.evaluate(
      () =>
        performance.now() -
        performance.getEntriesByName('chat-startup:shell-removed').at(-1)!
          .startTime
    );
    const calibrationFinishedAt = Date.now();
    const shellRemovedEpochMs =
      (calibrationStartedAt + calibrationFinishedAt) / 2 - shellAgeMs;
    await expect
      .poll(() => fixture.state.favoriteCreatedAt, { timeout: 20_000 })
      .not.toBeNull();
    const shellRemovedBeforeFavorite =
      shellRemovedEpochMs < fixture.state.favoriteCreatedAt!;
    const firstList = await capture(
      'cold-list-without-cache-slow-favorite',
      started,
      requestIndex,
      {
        shellRemovedEpochMs,
        favoriteCreatedEpochMs: fixture.state.favoriteCreatedAt,
        clockCalibrationRttMs: calibrationFinishedAt - calibrationStartedAt,
        shellRemovedBeforeFavorite
      }
    );
    expect(shellRemovedBeforeFavorite).toBe(!isBaseline);
    expect(firstList.wrongTopicFrames).toBe(0);
    await saveDeviceScreenshot('first-list.png');
  }
  const nativeScreen = device
    ? await device.screenshot()
    : (
        await execute(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], {
          encoding: 'buffer',
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true
        })
      ).stdout;
  await writeFile(resolve(output, 'screen.png'), nativeScreen);
  console.log('Базовые Android-сценарии завершены');
} catch (error) {
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify(
      {
        error: String(error),
        requests: fixture.requests,
        pageErrors,
        externalRequests: [...externalRequests]
      },
      null,
      2
    )
  );
  if (page && !page.isClosed())
    await saveDeviceScreenshot('failure.png').catch(() => {});
  throw error;
} finally {
  await adb('shell', 'am', 'force-stop', packageId);
  await Promise.allSettled(browsers.map(browser => browser.close()));
  console.log('WebView отключён');
  await device?.close();
  // Закрыть am instrument: Android driver иначе удерживает ADB-сокеты Node.
  if (device)
    await adb(
      'shell',
      'am',
      'force-stop',
      'com.microsoft.playwright.androiddriver'
    );
  if (device)
    await adb(
      'shell',
      'am',
      'force-stop',
      'com.microsoft.playwright.androiddriver.test'
    );
  console.log('Android driver закрыт');
  await fixture.close();
  await adb('forward', '--remove', 'tcp:9228').catch(() => {});
  await adb('reverse', '--remove', 'tcp:5188').catch(() => {});
  console.log('Локальный Android-стенд остановлен');
}
