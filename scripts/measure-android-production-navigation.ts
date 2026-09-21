import {
  chromium,
  type Browser,
  type CDPSession,
  type Page
} from 'playwright/test';
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

const phase = process.env.ANDROID_PERFORMANCE_PHASE || 'production-navigation';
const output = resolve('../artifacts', `chat-294-android-${phase}`);
await mkdir(output, { recursive: true });

const sleep = (ms: number) =>
  new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const percentile = (values: number[], ratio: number) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  ];
};
const sanitizePath = (urlValue: string): string => {
  const url = new URL(urlValue);
  if (url.pathname.startsWith('/api/media/object/'))
    return '/api/media/object/:object';
  if (url.pathname.startsWith('/emoji/noto/')) return '/emoji/noto/:emoji';
  return url.pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    .replace(/\/[A-Za-z0-9_-]{18,}(?=\/|$)/g, '/:id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
};

let browser: Browser | undefined;
let page: Page | undefined;
let cdp: CDPSession | undefined;
try {
  if (process.env.ANDROID_PERFORMANCE_COLD === '1')
    await adb('shell', 'am', 'force-stop', packageId);
  await adb(
    'shell',
    'am',
    'start',
    '-n',
    `${packageId}/sep.pksep.app.MainActivity`
  );
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
    'tcp:9231',
    `localabstract:webview_devtools_remote_${pid}`
  );
  let endpoint = '';
  while (!endpoint && Date.now() < deadline) {
    try {
      const response = await fetch('http://127.0.0.1:9231/json/version');
      endpoint = (await response.json()).webSocketDebuggerUrl || '';
    } catch {}
    if (!endpoint) await sleep(100);
  }
  if (!endpoint) throw new Error('WebView CDP endpoint did not become ready');

  browser = await chromium.connectOverCDP(endpoint, {
    noDefaults: true,
    timeout: 30_000
  });
  page = browser.contexts()[0].pages()[0];
  page.setDefaultTimeout(30_000);
  cdp = await browser.contexts()[0].newCDPSession(page);
  await cdp.send('Network.enable');
  type CdpRequest = {
    phase: 'probe' | 'stress';
    method: string;
    path: string;
    rawPath: string;
    servedFromCache: boolean;
    fromDiskCache: boolean;
    fromServiceWorker: boolean;
    encodedDataLength: number;
  };
  let networkPhase: CdpRequest['phase'] = 'probe';
  const cdpRequests = new Map<string, CdpRequest>();
  cdp.on('Network.requestWillBeSent', event => {
    if (!/^https?:/.test(event.request.url)) return;
    cdpRequests.set(event.requestId, {
      phase: networkPhase,
      method: event.request.method,
      path: sanitizePath(event.request.url),
      rawPath: new URL(event.request.url).pathname,
      servedFromCache: false,
      fromDiskCache: false,
      fromServiceWorker: false,
      encodedDataLength: 0
    });
  });
  cdp.on('Network.requestServedFromCache', event => {
    const request = cdpRequests.get(event.requestId);
    if (request) request.servedFromCache = true;
  });
  cdp.on('Network.responseReceived', event => {
    const request = cdpRequests.get(event.requestId);
    if (!request) return;
    request.fromDiskCache = event.response.fromDiskCache || false;
    request.fromServiceWorker = event.response.fromServiceWorker || false;
  });
  cdp.on('Network.loadingFinished', event => {
    const request = cdpRequests.get(event.requestId);
    if (request) request.encodedDataLength = event.encodedDataLength;
  });
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.locator('#app').waitFor({ state: 'attached' });
  await page.waitForFunction(
    () =>
      !document.querySelector('#startup-shell') &&
      document.querySelectorAll('li[data-topic-id]').length >= 2
  );

  const backButton = page.locator('[data-testid$="-Header-BackButton"]');
  if (await backButton.isVisible()) {
    await backButton.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.chat__mobile-list-layer')
          ?.getAttribute('aria-hidden') === 'false'
    );
  }

  const requests: Array<{
    method: string;
    path: string;
    rawPath: string;
    resourceType: string;
  }> = [];
  const failures: Array<{ method: string; path: string }> = [];
  page.on('request', request => {
    const url = request.url();
    if (!/^https?:/.test(url)) return;
    requests.push({
      method: request.method(),
      path: sanitizePath(url),
      rawPath: new URL(url).pathname,
      resourceType: request.resourceType()
    });
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (!/^https?:/.test(url)) return;
    failures.push({ method: request.method(), path: sanitizePath(url) });
  });
  await page.evaluate(() => performance.clearResourceTimings());

  const candidates = await page.evaluate(() => {
    const rows = [
      ...document.querySelectorAll<HTMLElement>('li[data-topic-id]')
    ];
    const availableIds = new Set(
      rows.map(row => row.dataset.topicId || '').filter(Boolean)
    );
    const cachedTopics: Array<{ id?: string; type?: string }> = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith('chat-offline-fast-topics-v1:')) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) || '[]');
        if (Array.isArray(value)) cachedTopics.push(...value);
      } catch {}
    }
    const groupIds = cachedTopics
      .filter(
        topic =>
          topic.type === 'GROUP' && topic.id && availableIds.has(topic.id)
      )
      .map(topic => topic.id!);
    const visibleIds = rows
      .filter(row => {
        const rect = row.getBoundingClientRect();
        return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      })
      .map(row => row.dataset.topicId || '')
      .filter(Boolean);
    return [...new Set([...groupIds.slice(0, 2), ...visibleIds.slice(0, 6)])];
  });
  if (candidates.length < 2) throw new Error('Fewer than two visible topics');

  type TransitionResult = {
    durationMs: number;
    skeletonFrames: number;
    wrongTopicFrames: number;
    messageCount: number;
    avatarCount: number;
    readyAvatarCount: number;
    visibleAvatarFallbacks: number;
    avatarImagesWithSource: number;
    settledReadyAvatarCount?: number;
    settledVisibleAvatarFallbacks?: number;
    settledAvatarImagesWithSource?: number;
    reactionCount: number;
    isGroup: boolean;
  };

  const transition = async (topicId: string): Promise<TransitionResult> => {
    await page!.evaluate(topic => {
      const row = document.querySelector<HTMLElement>(
        `li[data-topic-id="${CSS.escape(topic)}"] .contact-list__item`
      );
      if (!row) throw new Error('Topic row is missing');

      const previousMessageIds = new Set(
        [...document.querySelectorAll<HTMLElement>('[data-message-id]')]
          .map(node => node.dataset.messageId || '')
          .filter(Boolean)
      );
      let isGroupTopic = false;
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith('chat-offline-fast-topics-v1:')) continue;
        try {
          const topics = JSON.parse(localStorage.getItem(key) || '[]');
          if (
            Array.isArray(topics) &&
            topics.some(item => item?.id === topic && item?.type === 'GROUP')
          ) {
            isGroupTopic = true;
            break;
          }
        } catch {}
      }
      const state = {
        startedAt: performance.now(),
        durationMs: null as number | null,
        skeletonFrames: 0,
        wrongTopicFrames: 0,
        messageCount: 0,
        avatarCount: 0,
        readyAvatarCount: 0,
        visibleAvatarFallbacks: 0,
        avatarImagesWithSource: 0,
        reactionCount: 0,
        isGroup: isGroupTopic,
        done: false
      };
      (window as any).__physicalTopicTransition = state;
      row.click();

      const frame = () => {
        if (state.done) return;
        const skeleton = document.querySelector(
          '#startup-shell, [data-testid$="-MessageList-Skeleton"]'
        );
        if (skeleton) state.skeletonFrames += 1;

        const messages = [
          ...document.querySelectorAll<HTMLElement>('[data-message-id]')
        ];
        const routeChanged = location.pathname.includes(topic);
        if (
          routeChanged &&
          previousMessageIds.size > 0 &&
          messages.some(message =>
            previousMessageIds.has(message.dataset.messageId || '')
          )
        )
          state.wrongTopicFrames += 1;
        const hasResult =
          messages.length > 0 ||
          !!document.querySelector('[data-testid$="-MessageList-EmptyChat"]');
        const contentDeferred = document.querySelector(
          '.chat__mobile-route-view--content-deferred'
        );
        if (routeChanged && hasResult && !skeleton && !contentDeferred) {
          const avatars = [
            ...document.querySelectorAll<HTMLElement>(
              '.message-group__avatar.cached-avatar'
            )
          ].filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
          });
          state.durationMs = performance.now() - state.startedAt;
          state.messageCount = messages.length;
          state.avatarCount = avatars.length;
          state.readyAvatarCount = avatars.filter(node =>
            node.classList.contains('cached-avatar--image-ready')
          ).length;
          state.visibleAvatarFallbacks = avatars.filter(node => {
            const fallback = node.querySelector<HTMLElement>(
              '.avatar-yui-kit__fallback'
            );
            return fallback && getComputedStyle(fallback).display !== 'none';
          }).length;
          state.avatarImagesWithSource = avatars.filter(node =>
            Boolean(
              node
                .querySelector<HTMLImageElement>('.avatar-yui-kit__image')
                ?.getAttribute('src')
            )
          ).length;
          state.reactionCount = document.querySelectorAll(
            '.message .reactions .reaction'
          ).length;
          state.done = true;
          return;
        }
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }, topicId);

    await page!.waitForFunction(
      () => (window as any).__physicalTopicTransition?.done === true,
      undefined,
      { timeout: 15_000 }
    );
    return page!
      .evaluate(() => {
        const state = (window as any).__physicalTopicTransition;
        return {
          durationMs: state.durationMs,
          skeletonFrames: state.skeletonFrames,
          wrongTopicFrames: state.wrongTopicFrames,
          messageCount: state.messageCount,
          avatarCount: state.avatarCount,
          readyAvatarCount: state.readyAvatarCount,
          visibleAvatarFallbacks: state.visibleAvatarFallbacks,
          avatarImagesWithSource: state.avatarImagesWithSource,
          reactionCount: state.reactionCount,
          isGroup: state.isGroup
        };
      })
      .then(async sample => {
        if (!sample.isGroup || sample.avatarCount === 0) return sample;
        await sleep(500);
        const settled = await page!.evaluate(() => {
          const avatars = [
            ...document.querySelectorAll<HTMLElement>(
              '.message-group__avatar.cached-avatar'
            )
          ].filter(node => {
            const rect = node.getBoundingClientRect();
            return rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
          });
          return {
            settledReadyAvatarCount: avatars.filter(node =>
              node.classList.contains('cached-avatar--image-ready')
            ).length,
            settledVisibleAvatarFallbacks: avatars.filter(node => {
              const fallback = node.querySelector<HTMLElement>(
                '.avatar-yui-kit__fallback'
              );
              return fallback && getComputedStyle(fallback).display !== 'none';
            }).length,
            settledAvatarImagesWithSource: avatars.filter(node =>
              Boolean(
                node
                  .querySelector<HTMLImageElement>('.avatar-yui-kit__image')
                  ?.getAttribute('src')
              )
            ).length
          };
        });
        return { ...sample, ...settled };
      });
  };

  const probes: TransitionResult[] = [];
  const populated: Array<{ topicId: string; isGroup: boolean }> = [];
  for (const topicId of candidates) {
    const sample = await transition(topicId);
    probes.push(sample);
    if (sample.messageCount > 0)
      populated.push({ topicId, isGroup: sample.isGroup });
    if (populated.length >= 2 && populated.some(topic => topic.isGroup)) break;
    await backButton.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('.chat__mobile-list-layer')
          ?.getAttribute('aria-hidden') === 'false'
    );
  }
  if (populated.length < 2)
    throw new Error('Two populated topics were not found');
  const groupTopic = populated.find(topic => topic.isGroup);
  const otherTopic = populated.find(
    topic => topic.topicId !== groupTopic?.topicId
  );
  const chosen =
    groupTopic && otherTopic
      ? [groupTopic.topicId, otherTopic.topicId]
      : populated.slice(0, 2).map(topic => topic.topicId);

  const probeRequests = [...requests];
  const probeFailures = [...failures];
  const probeResourceTransfers = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map(entry => entry as PerformanceResourceTiming)
      .map(entry => ({
        name: entry.name,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize
      }))
  );
  requests.length = 0;
  failures.length = 0;
  networkPhase = 'stress';
  await page.evaluate(() => performance.clearResourceTimings());

  const transitions: TransitionResult[] = [];
  await transition(chosen[0]);
  for (let index = 0; index < 12; index += 1) {
    transitions.push(await transition(chosen[(index + 1) % 2]));
    await sleep(80);
  }

  const listScrollBefore = await page.evaluate(() => {
    const candidates = [
      ...document.querySelectorAll<HTMLElement>('.chat__mobile-list-layer *')
    ].filter(node => node.scrollHeight > node.clientHeight + 1);
    return candidates[0]?.scrollTop || 0;
  });
  await page.evaluate(() => {
    const state = {
      startedAt: performance.now(),
      readyAt: null as number | null,
      topSamples: [] as number[],
      done: false
    };
    (window as any).__physicalBackTransition = state;
    const frame = () => {
      const layer = document.querySelector('.chat__mobile-list-layer');
      const row = document.querySelector<HTMLElement>('li[data-topic-id]');
      if (layer?.getAttribute('aria-hidden') === 'false' && row) {
        state.topSamples.push(row.getBoundingClientRect().top);
        state.readyAt ??= performance.now();
        if (performance.now() - state.readyAt >= 500) {
          state.done = true;
          return;
        }
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await backButton.click();
  await page.waitForFunction(
    () => (window as any).__physicalBackTransition?.done === true,
    undefined,
    { timeout: 10_000 }
  );
  const back = await page.evaluate(listScrollBeforeValue => {
    const state = (window as any).__physicalBackTransition;
    const candidates = [
      ...document.querySelectorAll<HTMLElement>('.chat__mobile-list-layer *')
    ].filter(node => node.scrollHeight > node.clientHeight + 1);
    const listScrollAfter = candidates[0]?.scrollTop || 0;
    const topMin = Math.min(...state.topSamples);
    const topMax = Math.max(...state.topSamples);
    return {
      durationMs: state.readyAt - state.startedAt,
      scrollDeltaPx: listScrollAfter - listScrollBeforeValue,
      maxRowMovementPx: topMax - topMin
    };
  }, listScrollBefore);

  await sleep(1_000);
  const summarizeRequests = (
    items: Array<{ method: string; path: string; rawPath?: string }>
  ) =>
    Object.entries(
      items.reduce<Record<string, { count: number; rawPaths: Set<string> }>>(
        (counts, request) => {
          const key = `${request.method} ${request.path}`;
          const group = (counts[key] ||= { count: 0, rawPaths: new Set() });
          group.count += 1;
          if (request.rawPath) group.rawPaths.add(request.rawPath);
          return counts;
        },
        {}
      )
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([request, value]) => ({
        request,
        count: value.count,
        distinctResources: value.rawPaths.size || undefined
      }));
  const requestCounts = summarizeRequests(requests);
  const resourceTransfers = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map(entry => entry as PerformanceResourceTiming)
      .map(entry => ({
        name: entry.name,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize
      }))
  );
  const summarizeTransfers = (
    items: Array<{ name: string; transferSize: number }>
  ) =>
    Object.entries(
      items.reduce<
        Record<
          string,
          { entries: number; networkEntries: number; transferBytes: number }
        >
      >((summary, entry) => {
        const path = sanitizePath(entry.name);
        const group = (summary[path] ||= {
          entries: 0,
          networkEntries: 0,
          transferBytes: 0
        });
        group.entries += 1;
        if (entry.transferSize > 0) group.networkEntries += 1;
        group.transferBytes += entry.transferSize;
        return summary;
      }, {})
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => ({ path, ...value }));
  const transferSummary = summarizeTransfers(resourceTransfers);
  const summarizeCdpNetwork = (phase: CdpRequest['phase']) =>
    Object.entries(
      [...cdpRequests.values()]
        .filter(request => request.phase === phase)
        .reduce<
          Record<
            string,
            {
              entries: number;
              distinctPaths: Set<string>;
              cacheEntries: number;
              actualNetworkEntries: number;
              encodedDataBytes: number;
            }
          >
        >((summary, request) => {
          const key = `${request.method} ${request.path}`;
          const group = (summary[key] ||= {
            entries: 0,
            distinctPaths: new Set(),
            cacheEntries: 0,
            actualNetworkEntries: 0,
            encodedDataBytes: 0
          });
          const cached =
            request.servedFromCache ||
            request.fromDiskCache ||
            request.fromServiceWorker;
          group.entries += 1;
          group.distinctPaths.add(request.rawPath);
          if (cached) group.cacheEntries += 1;
          else group.actualNetworkEntries += 1;
          group.encodedDataBytes += request.encodedDataLength;
          return summary;
        }, {})
    )
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([request, value]) => ({
        request,
        entries: value.entries,
        distinctResources: value.distinctPaths.size,
        cacheEntries: value.cacheEntries,
        actualNetworkEntries: value.actualNetworkEntries,
        encodedDataBytes: value.encodedDataBytes
      }));
  const durations = transitions.map(sample => sample.durationMs);
  const result = {
    device: 'physical',
    probeCount: probes.length,
    transitionCount: transitions.length,
    transitionMs: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      max: Math.max(...durations)
    },
    skeletonFrames: transitions.reduce(
      (sum, sample) => sum + sample.skeletonFrames,
      0
    ),
    wrongTopicFrames: transitions.reduce(
      (sum, sample) => sum + sample.wrongTopicFrames,
      0
    ),
    maxMessageCount: Math.max(
      ...transitions.map(sample => sample.messageCount)
    ),
    groupSamples: transitions.filter(sample => sample.isGroup).length,
    avatarFirstFrames: transitions
      .filter(sample => sample.avatarCount > 0)
      .map(sample => ({
        avatars: sample.avatarCount,
        ready: sample.readyAvatarCount,
        visibleFallbacks: sample.visibleAvatarFallbacks,
        imagesWithSource: sample.avatarImagesWithSource,
        settledReady: sample.settledReadyAvatarCount,
        settledVisibleFallbacks: sample.settledVisibleAvatarFallbacks,
        settledImagesWithSource: sample.settledAvatarImagesWithSource
      })),
    reactionFirstFrames: transitions
      .filter(sample => sample.reactionCount > 0)
      .map(sample => sample.reactionCount),
    back,
    probeRequestCounts: summarizeRequests(probeRequests),
    probeTransferSummary: summarizeTransfers(probeResourceTransfers),
    probeNetworkSummary: summarizeCdpNetwork('probe'),
    requestCounts,
    transferSummary,
    networkSummary: summarizeCdpNetwork('stress'),
    probeFailedRequestCount: probeFailures.length,
    failedRequests: failures,
    pageErrorCount: pageErrors.length
  };
  await writeFile(
    resolve(output, 'results.json'),
    JSON.stringify(result, null, 2)
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await cdp?.detach().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  await adb('forward', '--remove', 'tcp:9231').catch(() => undefined);
}
