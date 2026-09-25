import { chromium, type Browser } from 'playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Сообщение отправляется через браузер. Здесь только открываем уже полученный push.
const serial = process.env.ANDROID_PERFORMANCE_SERIAL;
const expectedText = process.env.ANDROID_PERFORMANCE_NOTIFICATION_TEXT;
const expectedLatestText =
  process.env.ANDROID_PERFORMANCE_LATEST_TEXT || expectedText;
const seriesPrefix = process.env.ANDROID_PERFORMANCE_SERIES_PREFIX || '';
const seriesCount = Number(process.env.ANDROID_PERFORMANCE_SERIES_COUNT || 0);
const notificationSource =
  process.env.ANDROID_PERFORMANCE_NOTIFICATION_SOURCE || 'server-push';
if (!serial || !expectedText)
  throw new Error('Укажите устройство и текст тестового сообщения');
const packageId = 'sep.pksep.app';
const adbPath = resolve(
  process.env.ANDROID_HOME || resolve(process.env.LOCALAPPDATA!, 'Android/Sdk'),
  'platform-tools/adb.exe'
);
const execute = promisify(execFile);
const adb = async (...args: string[]) =>
  (
    await execute(adbPath, ['-s', serial, ...args], {
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024
    })
  ).stdout;
const sleep = (ms: number) =>
  new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const phase = process.env.ANDROID_PERFORMANCE_PHASE || 'received-notification';
const output = resolve('../artifacts', `chat-294-android-${phase}`);
await mkdir(output, { recursive: true });
const pid = async () =>
  (await adb('shell', 'pidof', packageId).catch(() => '')).trim();
const closeProcess = async () => {
  await adb(
    'shell',
    'am',
    'broadcast',
    '-n',
    `${packageId}/sep.pksep.app.StartupBenchmarkReceiver`,
    '--ez',
    'terminateOnly',
    'true'
  );
  const deadline = Date.now() + 5000;
  await sleep(600);
  while (await pid()) {
    if (Date.now() > deadline)
      throw new Error('Процесс не завершён: холодный замер отменён');
    await sleep(150);
  }
};

let browser: Browser | undefined;
try {
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  if (
    /^\s+showing=true\s*$/m.test(
      await adb('shell', 'dumpsys', 'window', 'policy')
    )
  )
    throw new Error('Телефон заблокирован');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  // Сначала дожидаемся карточки: завершение процесса во время доставки может
  // оборвать обработчик RuStore. Перед нажатием процесс всё равно закрывается.
  await adb('shell', 'cmd', 'statusbar', 'expand-notifications');
  let tap: { x: number; y: number } | undefined;
  let previousBounds = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    await adb(
      'shell',
      'uiautomator',
      'dump',
      '/data/local/tmp/chat-received-push.xml'
    );
    const xml = await adb(
      'shell',
      'cat',
      '/data/local/tmp/chat-received-push.xml'
    );
    const node = [...xml.matchAll(/<node\b[^>]*>/g)]
      .map(match => match[0])
      .find(value => {
        const text = value.match(/\btext="([^"]*)"/)?.[1] || '';
        return text.includes(expectedText);
      });
    const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds) {
      tap = {
        x: Math.round((Number(bounds[1]) + Number(bounds[3])) / 2),
        y: Math.round((Number(bounds[2]) + Number(bounds[4])) / 2)
      };
      if (previousBounds === bounds[0]) break;
      previousBounds = bounds[0];
    }
    await sleep(250);
  }
  if (!tap)
    throw new Error('Настоящее уведомление с тестовым текстом не найдено');
  if (await pid()) await closeProcess();
  const processRunningBeforeTap = !!(await pid());
  if (processRunningBeforeTap)
    throw new Error('Процесс перезапустился до нажатия');
  const launch = await adb('shell', `date +%s%3N; input tap ${tap.x} ${tap.y}`);
  const deviceLaunchStartedAt = Number(launch.trim().split(/\r?\n/)[0]);
  if (!Number.isFinite(deviceLaunchStartedAt))
    throw new Error('Не удалось прочитать часы телефона');
  const deadline = Date.now() + 30_000;
  while (!browser && Date.now() < deadline) {
    try {
      const processId = (await pid()).split(' ')[0];
      if (processId) {
        await adb(
          'forward',
          'tcp:9241',
          `localabstract:webview_devtools_remote_${processId}`
        );
        const response = await fetch('http://127.0.0.1:9241/json/list');
        const targets = await response.json();
        if (
          targets.some((target: { url?: string }) =>
            /^https?:/.test(target.url || '')
          )
        )
          browser = await chromium.connectOverCDP('http://127.0.0.1:9241', {
            noDefaults: true,
            timeout: 2000
          });
      }
    } catch {}
    if (!browser) await sleep(100);
  }
  if (!browser) throw new Error('WebView не запустился после нажатия на push');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(
    text => {
      const mark = performance
        .getEntriesByName('chat-notification:message-painted')
        .at(-1) as PerformanceMark | undefined;
      const message =
        mark?.detail?.messageId &&
        document.querySelector<HTMLElement>(
          `[data-message-id="${CSS.escape(mark.detail.messageId)}"]`
        );
      return message && message.innerText.includes(text);
    },
    expectedLatestText,
    { timeout: 30_000 }
  );
  if (seriesPrefix && seriesCount) {
    await page.waitForFunction(
      ({ prefix, count }) => {
        const messages = [
          ...document.querySelectorAll<HTMLElement>('[data-message-id]')
        ];
        return (
          new Set(
            messages
              .filter(node => node.innerText.includes(prefix))
              .map(node => node.dataset.messageId)
          ).size >= count
        );
      },
      { prefix: seriesPrefix, count: seriesCount },
      { timeout: 10_000 }
    );
  }
  const result = await page.evaluate(() => {
    const mark = performance
      .getEntriesByName('chat-notification:message-painted')
      .at(-1) as PerformanceMark;
    const message = document.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(mark.detail.messageId)}"]`
    );
    const rect = message?.getBoundingClientRect();
    const firstFrame = performance
      .getEntriesByName('chat-notification:first-message-frame')
      .at(-1) as PerformanceMark | undefined;
    return {
      webViewTimeOrigin: performance.timeOrigin,
      firstMessageFrameIncludesTarget:
        firstFrame?.detail?.includesTarget === true,
      firstMessageFrameIncludesLatest:
        firstFrame?.detail?.includesLatest === true,
      historyIsFresh: mark.detail?.isFresh === true,
      notificationIsLatest:
        mark.detail?.notificationMessageId === mark.detail?.messageId,
      targetPaintEpochMs: performance.timeOrigin + mark.startTime,
      targetMessageVisible:
        !!rect &&
        rect.width > 0 &&
        rect.height > 0 &&
        rect.top < innerHeight &&
        rect.bottom > 0,
      skeletonPresent: !!document.querySelector(
        '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
      ),
      marks: performance
        .getEntriesByType('mark')
        .filter(
          entry =>
            entry.name.startsWith('chat-startup:') ||
            entry.name.startsWith('chat-notification:')
        )
        .map(entry => ({ name: entry.name, at: entry.startTime })),
      messageCount: document.querySelectorAll('[data-message-id]').length,
      resources: performance.getEntriesByType('resource').map(entry => {
        const url = new URL(entry.name);
        return {
          path: url.pathname.startsWith('/assets/')
            ? url.pathname
            : url.pathname.split('/').slice(0, 3).join('/'),
          start: entry.startTime,
          duration: entry.duration
        };
      })
    };
  });
  const nativeLog = await adb(
    'logcat',
    '-d',
    `--pid=${(await pid()).split(' ')[0]}`,
    '-s',
    'ChatStartupBenchmark:I',
    '*:S'
  );
  const nativeMarks = [
    ...nativeLog.matchAll(/ChatStartupBenchmark:\s+([a-z-]+)\s+(\d{13})/g)
  ]
    .map(match => ({ stage: match[1], epochMs: Number(match[2]) }))
    .filter(mark => mark.epochMs >= deviceLaunchStartedAt);
  const nativeVisibleEpoch = Math.max(
    0,
    ...nativeMarks
      .filter(mark =>
        ['content-visible', 'splash-removed'].includes(mark.stage)
      )
      .map(mark => mark.epochMs)
  );
  const deviceLaunchToContentMs =
    Math.max(result.targetPaintEpochMs, nativeVisibleEpoch) -
    deviceLaunchStartedAt;
  const report = {
    launchMode: `process-cold-${notificationSource}`,
    ...(seriesPrefix ? { seriesMessagesVerified: seriesCount } : {}),
    processRunningBeforeTap,
    deviceLaunchStartedAt,
    deviceLaunchToContentMs,
    meetsOneSecondTarget:
      deviceLaunchToContentMs <= 1000 &&
      result.firstMessageFrameIncludesLatest &&
      result.historyIsFresh &&
      result.targetMessageVisible &&
      !result.skeletonPresent,
    nativeMarks: nativeMarks.map(mark => ({
      stage: mark.stage,
      at: mark.epochMs - deviceLaunchStartedAt
    })),
    ...result
  };
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(report, null, 2)
  );
  const screenshot = await execute(
    adbPath,
    ['-s', serial, 'exec-out', 'screencap', '-p'],
    { encoding: 'buffer', windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
  );
  await writeFile(resolve(output, 'phone.png'), screenshot.stdout);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close().catch(() => undefined);
  await adb('forward', '--remove', 'tcp:9241').catch(() => undefined);
}
