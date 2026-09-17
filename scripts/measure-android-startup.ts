import { chromium } from 'playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Только перезапуск процесса: авторизацию, кеш и переписку не изменяем.
const serial = process.env.ANDROID_PERFORMANCE_SERIAL;
if (!serial) throw new Error('Укажите ANDROID_PERFORMANCE_SERIAL');
const packageId = process.env.ANDROID_PERFORMANCE_PACKAGE || 'sep.pksep.app';
const expectedTopicText =
  process.env.ANDROID_PERFORMANCE_EXPECTED_TOPIC_TEXT || '';
if (!['sep.pksep.app', 'sep.pksep.app.performance'].includes(packageId))
  throw new Error('Неизвестный пакет приложения');
const sdk =
  process.env.ANDROID_HOME || resolve(process.env.LOCALAPPDATA!, 'Android/Sdk');
const execute = promisify(execFile);
const adb = async (...args: string[]) =>
  (
    await execute(
      resolve(sdk, 'platform-tools/adb.exe'),
      ['-s', serial, ...args],
      { timeout: 30_000, windowsHide: true }
    )
  ).stdout;
const output = resolve(
  '../artifacts',
  `chat-294-phone-${process.env.ANDROID_PERFORMANCE_PHASE || 'installed'}`
);
await mkdir(output, { recursive: true });
const samples: unknown[] = [];
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getMainProcessId = async (): Promise<string> => {
  const processIds = (await adb('shell', 'pidof', packageId).catch(() => ''))
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  for (const processId of processIds) {
    const commandLine = await adb(
      'shell',
      'cat',
      `/proc/${processId}/cmdline`
    ).catch(() => '');
    if (commandLine.replaceAll('\0', '').trim() === packageId) {
      return processId;
    }
  }

  return '';
};
try {
  const policy = await adb('shell', 'dumpsys', 'window', 'policy');
  if (/^\s+showing=true\s*$/m.test(policy))
    throw new Error('Разблокируйте телефон перед замером видимого интерфейса');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  for (
    let iteration = 0;
    iteration < Number(process.env.ANDROID_PERFORMANCE_ITERATIONS || 3);
    iteration++
  ) {
    await adb('shell', 'am', 'force-stop', packageId);
    const started = performance.now();
    const nativeLaunch = await adb(
      'shell',
      // Оба времени принадлежат телефону: подключение CDP не входит в результат.
      `date +%s%3N; am start -W -n ${packageId}/sep.pksep.app.NotificationLaunchActivity`
    );
    const deviceLaunchStartedAt = Number(nativeLaunch.trim().split(/\r?\n/)[0]);
    if (!Number.isFinite(deviceLaunchStartedAt))
      throw new Error('Не удалось прочитать часы устройства перед запуском');
    const deadline = Date.now() + 30_000;
    let devtoolsReady = false;
    try {
      await adb('forward', '--remove', 'tcp:9229');
    } catch {}
    while (!devtoolsReady && Date.now() < deadline) {
      try {
        const pid = await getMainProcessId();
        if (pid) {
          await adb(
            'forward',
            'tcp:9229',
            `localabstract:webview_devtools_remote_${pid}`
          );
          const response = await fetch('http://127.0.0.1:9229/json/list');
          const targets = response.ok ? await response.json() : [];
          devtoolsReady = targets.some((target: { url?: string }) =>
            /^https?:/.test(target.url || '')
          );
        }
      } catch {}
      if (!devtoolsReady) await sleep(100);
    }
    if (!devtoolsReady) throw new Error('WebView не доступен для замера');
    // Android 16 WebView can expose the discovery endpoint just before its
    // browser socket accepts clients, so keep this startup race inside the
    // measurement runner rather than turning it into a failed cold start.
    let browser;
    while (!browser && Date.now() < deadline) {
      try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9229', {
          noDefaults: true,
          timeout: 2_000
        });
      } catch {
        await sleep(100);
      }
    }
    if (!browser) throw new Error('CDP WebView не доступен для замера');
    try {
      const page = browser.contexts()[0].pages()[0];
      await page.evaluate(() => {
        const state = {
          observedAt: performance.now(),
          readyAt: null as number | null
        };
        (window as any).__phoneStartup = state;
        const frame = () => {
          const rows = [
            ...document.querySelectorAll<HTMLElement>(
              '[data-testid*="-ContactList-Item"]'
            )
          ];
          if (
            !document.querySelector('#startup-shell') &&
            rows.some(node => {
              const box = node.getBoundingClientRect();
              return (
                box.width > 0 &&
                box.height > 0 &&
                box.top < innerHeight &&
                box.bottom > 0
              );
            })
          )
            state.readyAt = performance.now();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await page.waitForFunction(
        () => (window as any).__phoneStartup?.readyAt != null,
        undefined,
        { timeout: 30_000 }
      );
      const processStartToObservedReadyMs = performance.now() - started;
      await sleep(5000);
      const sample = {
        iteration,
        nativeLaunch,
        processStartToObservedReadyMs,
        ...(await page.evaluate(
          expectedText => ({
            ...(window as any).__phoneStartup,
            shellRemovedEpochMs: (() => {
              const mark = performance.getEntriesByName(
                'chat-startup:shell-removed'
              )[0];
              return mark ? performance.timeOrigin + mark.startTime : null;
            })(),
            contentPaintedEpochMs: (() => {
              const mark = performance.getEntriesByName(
                'chat-startup:content-painted'
              )[0];
              return mark ? performance.timeOrigin + mark.startTime : null;
            })(),
            freshTopicsEpochMs: (() => {
              const mark = performance.getEntriesByName(
                'chat-startup:topics-resolved'
              )[0] as PerformanceMark | undefined;
              return mark?.detail?.isFresh
                ? performance.timeOrigin + mark.startTime
                : null;
            })(),
            expectedTopicVisible:
              !expectedText ||
              [
                ...document.querySelectorAll<HTMLElement>('[data-topic-id]')
              ].some(node => {
                const box = node.getBoundingClientRect();
                return (
                  node.innerText.includes(expectedText) &&
                  box.height > 0 &&
                  box.top < innerHeight &&
                  box.bottom > 0
                );
              }),
            marks: performance
              .getEntriesByType('mark')
              .filter(x => x.name.startsWith('chat-startup:'))
              .map(x => ({ name: x.name, at: x.startTime })),
            topicRows: document.querySelectorAll(
              '[data-testid*="-ContactList-Item"]'
            ).length,
            // Не сохраняем имена, тексты, токены, идентификаторы и параметры запросов.
            resources: performance.getEntriesByType('resource').map(x => {
              const url = new URL(x.name);
              return {
                path: url.pathname.startsWith('/assets/')
                  ? url.pathname
                  : url.pathname.split('/').slice(0, 3).join('/'),
                start: x.startTime,
                duration: x.duration
              };
            })
          }),
          expectedTopicText
        ))
      };
      const nativeLog = await adb(
        'logcat',
        '-d',
        '-s',
        'ChatStartupBenchmark:I',
        '*:S'
      );
      const nativeMarks = [
        ...nativeLog.matchAll(/ChatStartupBenchmark:\s+([a-z-]+)\s+(\d{13})/g)
      ]
        .map(match => ({ stage: match[1], epochMs: Number(match[2]) }))
        .filter(mark => mark.epochMs >= deviceLaunchStartedAt);
      const contentEpoch =
        sample.contentPaintedEpochMs ?? sample.shellRemovedEpochMs;
      const nativeContentEpoch = Math.max(
        0,
        ...nativeMarks
          .filter(mark =>
            ['content-visible', 'splash-removed'].includes(mark.stage)
          )
          .map(mark => mark.epochMs)
      );
      const nativeLogoMark = nativeMarks.find(
        mark => mark.stage === 'native-logo-visible'
      );
      const finalWebViewContentMs =
        contentEpoch === null
          ? null
          : Math.max(contentEpoch, nativeContentEpoch) - deviceLaunchStartedAt;
      const deviceLaunchToContentMs = finalWebViewContentMs;
      Object.assign(sample, {
        nativeMarks: nativeMarks.map(mark => ({
          stage: mark.stage,
          at: mark.epochMs - deviceLaunchStartedAt
        })),
        deviceLaunchToLogoMs: nativeLogoMark
          ? nativeLogoMark.epochMs - deviceLaunchStartedAt
          : null,
        deviceLaunchToContentMs,
        finalWebViewContentMs,
        readinessMetric:
          sample.contentPaintedEpochMs === null
            ? 'shell-removed'
            : 'content-painted',
        meetsOneSecondTarget:
          deviceLaunchToContentMs !== null &&
          deviceLaunchToContentMs <= 1000 &&
          sample.freshTopicsEpochMs !== null &&
          contentEpoch !== null &&
          sample.freshTopicsEpochMs <= contentEpoch &&
          sample.expectedTopicVisible
      });
      samples.push(sample);
      await writeFile(
        resolve(output, 'results.json'),
        JSON.stringify(samples, null, 2)
      );
      console.log(JSON.stringify({ ...sample, resources: undefined }));
    } finally {
      await browser.close();
    }
  }
} finally {
  try {
    await adb('forward', '--remove', 'tcp:9229');
  } catch {}
}
