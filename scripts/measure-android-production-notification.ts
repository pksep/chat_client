import { chromium, type Browser, type Page } from 'playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const serial = process.env.ANDROID_PERFORMANCE_SERIAL;
if (!serial) throw new Error('Set ANDROID_PERFORMANCE_SERIAL');

const packageId = 'sep.pksep.app';
const realNotification =
  process.env.ANDROID_PERFORMANCE_REAL_NOTIFICATION === '1';
const warmLaunch =
  realNotification && process.env.ANDROID_PERFORMANCE_WARM === '1';
const sdk =
  process.env.ANDROID_HOME || resolve(process.env.LOCALAPPDATA!, 'Android/Sdk');
const adbPath = resolve(sdk, 'platform-tools/adb.exe');
const execute = promisify(execFile);
const adb = async (...args: string[]) =>
  (
    await execute(adbPath, ['-s', serial, ...args], {
      timeout: 60_000,
      windowsHide: true
    })
  ).stdout;
const sleep = (ms: number) =>
  new Promise(resolveSleep => setTimeout(resolveSleep, ms));
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
const phase =
  process.env.ANDROID_PERFORMANCE_PHASE || 'production-notification';
const output = resolve('../artifacts', `chat-294-android-${phase}`);
await mkdir(output, { recursive: true });

const connectPage = async (
  port: number
): Promise<{ browser: Browser; page: Page }> => {
  const deadline = Date.now() + 30_000;
  let pid = '';
  while (!pid && Date.now() < deadline) {
    try {
      pid = await getMainProcessId();
    } catch {
      pid = '';
    }
    if (!pid) await sleep(100);
  }
  if (!pid) throw new Error('Application process did not start');
  await adb(
    'forward',
    `tcp:${port}`,
    `localabstract:webview_devtools_remote_${pid}`
  );
  let endpoint = '';
  while (!endpoint && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      endpoint = (await response.json()).webSocketDebuggerUrl || '';
    } catch {}
    if (!endpoint) await sleep(100);
  }
  if (!endpoint) throw new Error('WebView CDP endpoint did not become ready');
  const browser = await chromium.connectOverCDP(endpoint, {
    noDefaults: true,
    timeout: 30_000
  });
  const page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(30_000);
  return { browser, page };
};

let browser: Browser | undefined;
try {
  const policy = await adb('shell', 'dumpsys', 'window', 'policy');
  if (/^\s+showing=true\s*$/m.test(policy))
    throw new Error('Разблокируйте телефон перед замером видимого интерфейса');
  await adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  if (warmLaunch) await adb('shell', 'am', 'force-stop', packageId);
  await adb(
    'shell',
    'am',
    'start',
    '-n',
    `${packageId}/sep.pksep.app.NotificationLaunchActivity`
  );
  ({ browser } = await connectPage(9232));
  let page = browser.contexts()[0].pages()[0];
  const initialBack = page.locator('[data-testid$="-Header-BackButton"]');
  if (await initialBack.isVisible()) await initialBack.click();
  await page.waitForFunction(
    () =>
      !document.querySelector('#startup-shell') &&
      document.querySelectorAll('li[data-topic-id]').length > 0
  );
  const target = await page.evaluate(async () => {
    const groups = new Set<string>();
    const topicFallbacks: {
      topicId: string;
      messageId: string;
      score: number;
    }[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('chat-offline-fast-topics-v1:')) continue;
      try {
        const topics = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(topics))
          topics
            .filter(topic => topic?.type === 'GROUP' && topic?.id)
            .forEach(topic => {
              groups.add(topic.id);
              if (topic?.lastMessage?.id)
                topicFallbacks.push({
                  topicId: topic.id,
                  messageId: topic.lastMessage.id,
                  score: new Date(topic.lastMessage.createdAt || 0).getTime()
                });
            });
      } catch {}
    }
    const records = await new Promise<any[]>(resolveRecords => {
      const open = indexedDB.open('chat-sync-shadow-db');
      open.onerror = () => resolveRecords([]);
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('topicPreviews')) {
          db.close();
          resolveRecords([]);
          return;
        }
        const request = db
          .transaction('topicPreviews', 'readonly')
          .objectStore('topicPreviews')
          .getAll();
        request.onerror = () => {
          db.close();
          resolveRecords([]);
        };
        request.onsuccess = () => {
          const result = Array.isArray(request.result) ? request.result : [];
          db.close();
          resolveRecords(result);
        };
      };
    });
    const candidates = [
      ...records
        .filter(
          record =>
            groups.has(record?.topicId) && Array.isArray(record?.messages)
        )
        .flatMap(record =>
          record.messages.map((message: any) => ({
            topicId: record.topicId as string,
            messageId: message?.id as string,
            score: new Date(message?.createdAt || 0).getTime()
          }))
        ),
      ...topicFallbacks
    ]
      .filter(candidate => candidate.topicId && candidate.messageId)
      .sort((left, right) => right.score - left.score);
    if (candidates[0])
      return {
        topicId: candidates[0].topicId,
        messageId: candidates[0].messageId
      };
    return null;
  });
  if (!target)
    throw new Error('Cached group notification target was not found');
  if (
    ![target.topicId, target.messageId].every(id => /^[a-f0-9-]{36}$/i.test(id))
  )
    throw new Error('Invalid cached notification identifiers');
  const tracing =
    warmLaunch && process.env.ANDROID_PERFORMANCE_TRACE === '1'
      ? await page.context().newCDPSession(page)
      : undefined;
  const traceEvents: unknown[] = [];
  if (tracing) {
    tracing.on('Tracing.dataCollected', event =>
      traceEvents.push(...event.value)
    );
    await Promise.race([
      tracing.send('Tracing.start', {
        categories:
          'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline',
        transferMode: 'ReportEvents'
      }),
      sleep(15_000).then(() => {
        throw new Error('WebView tracing start timed out');
      })
    ]);
  }
  if (warmLaunch) {
    await page.evaluate(targetValue => {
      (window as any).__notificationBenchmarkReadyAt = null;
      const timeline: Record<string, number> = {};
      (window as any).__notificationBenchmarkTimeline = timeline;
      const mark = (name: string) => {
        timeline[name] ??= performance.timeOrigin + performance.now();
      };
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      history.pushState = function (...args) {
        if (String(args[2]).includes(targetValue.topicId))
          mark('routeAssigned');
        return originalPushState.apply(this, args);
      };
      history.replaceState = function (...args) {
        if (String(args[2]).includes(targetValue.topicId))
          mark('routeAssigned');
        return originalReplaceState.apply(this, args);
      };
      const androidBridge = (window as any).androidBridge;
      const originalOnMessage = androidBridge?.onmessage;
      if (originalOnMessage) {
        androidBridge.onmessage = function (event: MessageEvent) {
          if (String(event.data).includes(targetValue.topicId))
            mark('nativePayload');
          return originalOnMessage.call(this, event);
        };
      }
      (window as any).__notificationBenchmarkRestore = () => {
        history.pushState = originalPushState;
        history.replaceState = originalReplaceState;
        if (originalOnMessage) androidBridge.onmessage = originalOnMessage;
      };
      let wasHidden = false;
      const check = () => {
        if (document.visibilityState === 'hidden') wasHidden = true;
        if (wasHidden && document.visibilityState === 'visible')
          mark('foreground');
        if (location.pathname.includes(targetValue.topicId)) mark('topicRoute');
        const message = document.querySelector<HTMLElement>(
          `[data-message-id="${targetValue.messageId}"]`
        );
        const rect = message?.getBoundingClientRect();
        if (message) mark('targetInDom');
        if (document.querySelector('[data-message-id]')) mark('messagesInDom');
        if (
          location.pathname.includes(targetValue.topicId) &&
          rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < innerHeight &&
          document.querySelector(
            '.chat__input .ProseMirror[contenteditable="true"]'
          ) &&
          !document.querySelector(
            '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
          )
        ) {
          requestAnimationFrame(() => {
            (window as any).__notificationBenchmarkReadyAt =
              performance.timeOrigin + performance.now();
          });
        } else requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    }, target);
  } else {
    await browser.close();
    browser = undefined;
    await adb('forward', '--remove', 'tcp:9232').catch(() => undefined);
    if (!realNotification) await adb('shell', 'am', 'force-stop', packageId);
  }

  let tapPoint: { x: number; y: number } | undefined;
  let processRunningBeforeTap: boolean | undefined;
  if (realNotification) {
    // A notification benchmark starts from a genuinely stopped package. This
    // also terminates auxiliary app processes before the receiver creates the
    // card whose PendingIntent is measured below.
    if (!warmLaunch) await adb('shell', 'am', 'force-stop', packageId);
    await adb('shell', 'input', 'keyevent', '3');
    await adb(
      'shell',
      'am',
      'broadcast',
      '--include-stopped-packages',
      '-n',
      `${packageId}/sep.pksep.app.StartupBenchmarkReceiver`,
      '--es',
      'topicId',
      target.topicId,
      '--es',
      'messageId',
      target.messageId,
      '--es',
      'topicType',
      'GROUP',
      '--ez',
      'terminateAfterPost',
      (
        !warmLaunch &&
        process.env.ANDROID_PERFORMANCE_KEEP_NOTIFICATION_PROCESS !== '1'
      ).toString()
    );
    // Уведомление обрабатывается системой после завершения broadcast.
    await sleep(500);
    if (
      !warmLaunch &&
      process.env.ANDROID_PERFORMANCE_KEEP_NOTIFICATION_PROCESS !== '1'
    ) {
      // Let the background push path persist its bounded fresh page before
      // simulating a later OS process eviction. The tap itself is still fully
      // process-cold.
      await sleep(2200);
      // Background SDKs may briefly restart the package after the first
      // receiver exits. Ask the benchmark-only receiver to remove the task and
      // terminate its process again without deleting the notification card.
      await adb(
        'shell',
        'am',
        'broadcast',
        '--include-stopped-packages',
        '-n',
        `${packageId}/sep.pksep.app.StartupBenchmarkReceiver`,
        '--ez',
        'terminateOnly',
        'true'
      );
      await sleep(700);
    }
    processRunningBeforeTap = !!(
      await adb('shell', 'pidof', packageId).catch(() => '')
    ).trim();
    await adb('shell', 'cmd', 'statusbar', 'expand-notifications');
    let bounds: RegExpMatchArray | null = null;
    let previousBounds = '';
    for (let attempt = 0; attempt < 6; attempt++) {
      await adb(
        'shell',
        'uiautomator',
        'dump',
        '/data/local/tmp/chat-startup-notification.xml'
      );
      const xml = await adb(
        'shell',
        'cat',
        '/data/local/tmp/chat-startup-notification.xml'
      );
      const node = xml.match(
        /<node\b[^>]*\btext="Проверка открытия"[^>]*>/
      )?.[0];
      bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/) || null;
      if (bounds && previousBounds === bounds[0]) break;
      previousBounds = bounds?.[0] || '';
      // Холодный SystemUI может закрыть шторку после завершения Activity.
      // Повторное раскрытие относится к подготовке, отсчёт начнётся с нажатия.
      if (!bounds && !xml.includes('package="com.android.systemui"')) {
        await adb('shell', 'cmd', 'statusbar', 'expand-notifications');
      }
      await sleep(300);
    }
    if (!bounds)
      throw new Error('Local benchmark notification card was not found');
    tapPoint = {
      x: Math.round((Number(bounds[1]) + Number(bounds[3])) / 2),
      y: Math.round((Number(bounds[2]) + Number(bounds[4])) / 2)
    };
    if (
      !warmLaunch &&
      process.env.ANDROID_PERFORMANCE_KEEP_NOTIFICATION_PROCESS !== '1'
    ) {
      await adb(
        'shell',
        'am',
        'broadcast',
        '--include-stopped-packages',
        '-n',
        `${packageId}/sep.pksep.app.StartupBenchmarkReceiver`,
        '--ez',
        'terminateOnly',
        'true'
      );
      for (let attempt = 0; attempt < 20; attempt++) {
        if (!(await adb('shell', 'pidof', packageId).catch(() => '')).trim())
          break;
        await sleep(50);
      }
    }
    // Проверяем непосредственно перед нажатием: фоновая задача могла запустить
    // процесс, пока SystemUI готовил карточку.
    processRunningBeforeTap = !!(
      await adb('shell', 'pidof', packageId).catch(() => '')
    ).trim();
    if (
      !warmLaunch &&
      process.env.ANDROID_PERFORMANCE_KEEP_NOTIFICATION_PROCESS !== '1' &&
      processRunningBeforeTap
    ) {
      throw new Error(
        'Процесс работает перед нажатием: холодный замер отменён'
      );
    }
  }

  if (!realNotification) {
    processRunningBeforeTap = !!(
      await adb('shell', 'pidof', packageId).catch(() => '')
    ).trim();
    if (!warmLaunch && processRunningBeforeTap) {
      throw new Error('Процесс работает перед intent: холодный замер отменён');
    }
  }

  const profiler =
    warmLaunch && process.env.ANDROID_PERFORMANCE_CPU_PROFILE === '1'
      ? await page.context().newCDPSession(page)
      : undefined;
  if (profiler) {
    await profiler.send('Profiler.enable');
    await profiler.send('Profiler.start');
  }
  const startedAt = performance.now();
  const nativeLaunch = await adb(
    'shell',
    tapPoint
      ? `date +%s%3N; input tap ${tapPoint.x} ${tapPoint.y}`
      : `date +%s%3N; am start -W -n ${packageId}/sep.pksep.app.NotificationTapLaunchActivity ` +
          `-a sep.pksep.app.action.OPEN_CHAT_NOTIFICATION --es topicId ${target.topicId} ` +
          `--es messageId ${target.messageId} --es rustore.message_id ${target.messageId} --es topicType GROUP`
  );
  const deviceLaunchStartedAt = Number(nativeLaunch.trim().split(/\r?\n/)[0]);
  if (!Number.isFinite(deviceLaunchStartedAt))
    throw new Error('Device timestamp unavailable');
  if (!browser) ({ browser, page } = await connectPage(9233));
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.waitForFunction(
    targetValue => {
      const messages = document.querySelectorAll('[data-message-id]');
      return (
        location.pathname.includes(targetValue.topicId) &&
        messages.length > 0 &&
        !document.querySelector(
          '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
        )
      );
    },
    target,
    { timeout: 30_000 }
  );
  const processStartToObservedReadyMs = performance.now() - startedAt;
  if (tracing) {
    const completed = new Promise<void>(resolveTrace =>
      tracing.once('Tracing.tracingComplete', () => resolveTrace())
    );
    await tracing.send('Tracing.end');
    await completed;
    await writeFile(
      resolve(output, 'notification.trace.json'),
      JSON.stringify({ traceEvents })
    );
    await tracing.detach();
  }
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop');
    await writeFile(
      resolve(output, 'notification.cpuprofile'),
      JSON.stringify(profile)
    );
    await profiler.detach();
  }
  await page.waitForFunction(
    warm =>
      warm
        ? (window as any).__notificationBenchmarkReadyAt !== null
        : performance.getEntriesByName('chat-startup:content-painted').length >
          0,
    warmLaunch
  );
  const result = await page.evaluate(targetValue => {
    const firstFrame = performance
      .getEntriesByName('chat-notification:first-message-frame')
      .at(-1) as PerformanceMark | undefined;
    const latestPaint = performance
      .getEntriesByName('chat-notification:message-painted')
      .at(-1) as PerformanceMark | undefined;
    const messages = [
      ...document.querySelectorAll<HTMLElement>('[data-message-id]')
    ];
    const visibleAvatars = [
      ...document.querySelectorAll<HTMLElement>(
        '.message-group__avatar.cached-avatar'
      )
    ].filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    });
    return {
      composerReady: Boolean(
        document.querySelector(
          '.chat__input .ProseMirror[contenteditable="true"]'
        )
      ),
      firstFrameFresh: firstFrame?.detail?.isFresh === true,
      firstFrameIncludesLatest: firstFrame?.detail?.includesLatest === true,
      latestMessagePaintedEpochMs: latestPaint?.detail?.isFresh
        ? performance.timeOrigin + latestPaint.startTime
        : null,
      readyEpochMs:
        (window as any).__notificationBenchmarkReadyAt ??
        (() => {
          const mark = performance
            .getEntriesByName('chat-startup:content-painted')
            .at(-1);
          return mark ? performance.timeOrigin + mark.startTime : null;
        })(),
      timeline: (window as any).__notificationBenchmarkTimeline,
      resources: performance
        .getEntriesByType('resource')
        .filter(entry => new URL(entry.name).pathname.startsWith('/assets/'))
        .map(entry => ({
          path: new URL(entry.name).pathname,
          startEpochMs: performance.timeOrigin + entry.startTime,
          duration: entry.duration
        })),
      targetMessageVisible: messages.some(message => {
        const rect = message.getBoundingClientRect();
        return (
          message.dataset.messageId === targetValue.messageId &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom > 0 &&
          rect.top < innerHeight
        );
      }),
      messageCount: messages.length,
      skeletonPresent: !!document.querySelector(
        '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
      ),
      avatarCount: visibleAvatars.length,
      readyAvatarCount: visibleAvatars.filter(node =>
        node.classList.contains('cached-avatar--image-ready')
      ).length,
      visibleAvatarFallbacks: visibleAvatars.filter(node => {
        const fallback = node.querySelector<HTMLElement>(
          '.avatar-yui-kit__fallback'
        );
        return fallback && getComputedStyle(fallback).display !== 'none';
      }).length,
      reactionCount: document.querySelectorAll('.message .reactions .reaction')
        .length,
      marks: performance
        .getEntriesByType('mark')
        .filter(mark => mark.name.startsWith('chat-startup:'))
        .map(mark => ({ name: mark.name, at: mark.startTime }))
    };
  }, target);
  const nativeTimings = Object.fromEntries(
    [...nativeLaunch.matchAll(/^(TotalTime|WaitTime):\s+(\d+)$/gm)].map(
      match => [match[1], Number(match[2])]
    )
  );
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
  const nativeContentEpoch = Math.max(
    0,
    ...nativeMarks
      .filter(mark =>
        ['content-visible', 'splash-removed', 'web-content-ready'].includes(
          mark.stage
        )
      )
      .map(mark => mark.epochMs)
  );
  const nativeLogoMark = nativeMarks.find(
    mark => mark.stage === 'native-logo-visible'
  );
  const finalWebViewContentMs =
    result.readyEpochMs === null
      ? null
      : Math.max(
          result.readyEpochMs,
          result.latestMessagePaintedEpochMs || 0,
          nativeContentEpoch
        ) - deviceLaunchStartedAt;
  const deviceLaunchToContentMs = finalWebViewContentMs;
  const report = {
    launchMode: realNotification
      ? warmLaunch
        ? 'warm-notification-card'
        : processRunningBeforeTap
          ? 'activity-cold-notification-card'
          : 'process-cold-notification-card'
      : 'cold-notification-intent',
    processRunningBeforeTap,
    activityRestored: nativeMarks.some(
      mark => mark.stage === 'activity-restored'
    ),
    nativeHistoryRetargeted: nativeMarks.some(
      mark => mark.stage === 'history-retargeted'
    ),
    nativeHistoryApplied: result.marks.some(
      mark => mark.name === 'chat-startup:native-history-applied'
    ),
    deviceLaunchToLogoMs: nativeLogoMark
      ? nativeLogoMark.epochMs - deviceLaunchStartedAt
      : null,
    deviceLaunchToContentMs,
    nativeContentState: 'webview',
    finalWebViewContentMs,
    deviceLaunchStartedAt,
    meetsOneSecondTarget:
      result.targetMessageVisible &&
      result.composerReady &&
      result.firstFrameFresh &&
      result.firstFrameIncludesLatest &&
      result.latestMessagePaintedEpochMs !== null &&
      !processRunningBeforeTap &&
      pageErrors.length === 0 &&
      deviceLaunchToContentMs !== null &&
      deviceLaunchToContentMs <= 1000,
    nativeTimings,
    nativeMarks: nativeMarks.map(mark => ({
      stage: mark.stage,
      at: mark.epochMs - deviceLaunchStartedAt
    })),
    processStartToObservedReadyMs,
    ...result,
    pageErrorCount: pageErrors.length
  };
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  if (warmLaunch)
    await page.evaluate(() =>
      (window as any).__notificationBenchmarkRestore?.()
    );

  const backButton = page.locator('[data-testid$="-Header-BackButton"]');
  if (await backButton.isVisible()) await backButton.click();
} finally {
  await browser?.close().catch(() => undefined);
  await adb('forward', '--remove', 'tcp:9232').catch(() => undefined);
  await adb('forward', '--remove', 'tcp:9233').catch(() => undefined);
}
