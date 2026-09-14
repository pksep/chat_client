import { chromium, type Browser, type Page } from 'playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const serial = process.env.ANDROID_PERFORMANCE_SERIAL;
if (!serial) throw new Error('Set ANDROID_PERFORMANCE_SERIAL');

const packageId = 'sep.pksep.app';
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
      pid = (await adb('shell', 'pidof', packageId)).trim().split(' ')[0] || '';
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
  await adb(
    'shell',
    'am',
    'start',
    '-n',
    `${packageId}/sep.pksep.app.MainActivity`
  );
  ({ browser } = await connectPage(9232));
  let page = browser.contexts()[0].pages()[0];
  await page.waitForFunction(
    () =>
      !document.querySelector('#startup-shell') &&
      document.querySelectorAll('li[data-topic-id]').length > 0
  );
  const target = await page.evaluate(async () => {
    const groups = new Set<string>();
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('chat-offline-fast-topics-v1:')) continue;
      try {
        const topics = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(topics))
          topics
            .filter(topic => topic?.type === 'GROUP' && topic?.id)
            .forEach(topic => groups.add(topic.id));
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
    const candidates = records
      .filter(
        record => groups.has(record?.topicId) && Array.isArray(record?.messages)
      )
      .flatMap(record =>
        record.messages.map((message: any) => ({
          topicId: record.topicId as string,
          messageId: message?.id as string,
          score:
            (message?.senderUserId &&
            message.senderUserId !== record.userId &&
            (message?.senderUser?.avatarUrl || message?.senderUser?.avatarPath)
              ? 100
              : 0) +
            (Array.isArray(message?.reactions) ? message.reactions.length : 0)
        }))
      )
      .filter(candidate => candidate.messageId)
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
  await browser.close();
  browser = undefined;
  await adb('forward', '--remove', 'tcp:9232').catch(() => undefined);
  await adb('shell', 'am', 'force-stop', packageId);

  const startedAt = performance.now();
  const nativeLaunch = await adb(
    'shell',
    'am',
    'start',
    '-W',
    '-n',
    `${packageId}/sep.pksep.app.MainActivity`,
    '-a',
    'sep.pksep.app.action.OPEN_CHAT_NOTIFICATION',
    '--es',
    'topicId',
    target.topicId,
    '--es',
    'messageId',
    target.messageId,
    '--es',
    'rustore.message_id',
    target.messageId,
    '--es',
    'topicType',
    'GROUP'
  );
  ({ browser, page } = await connectPage(9233));
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
  const result = await page.evaluate(targetValue => {
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
      targetMessageVisible: messages.some(
        message => message.dataset.messageId === targetValue.messageId
      ),
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
  const report = {
    nativeTimings,
    processStartToObservedReadyMs,
    ...result,
    pageErrorCount: pageErrors.length
  };
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));

  const backButton = page.locator('[data-testid$="-Header-BackButton"]');
  if (await backButton.isVisible()) await backButton.click();
} finally {
  await browser?.close().catch(() => undefined);
  await adb('forward', '--remove', 'tcp:9232').catch(() => undefined);
  await adb('forward', '--remove', 'tcp:9233').catch(() => undefined);
}
