import { Capacitor, registerPlugin } from '@capacitor/core';
import { topicSyncEndpoint, type TopicSyncState } from '../utils/topic-sync';
import { takePreparedStartupRead } from '../utils/prepared-startup-reads';

const native = registerPlugin<{
  takeStartupRead(options: {
    token: string;
    apiUrl: string;
    endpoint: string;
  }): Promise<{ available: boolean; data?: unknown; startedAt?: number }>;
  saveStartupReadPlan(options: {
    token: string;
    apiUrl: string;
    endpoints: string[];
  }): Promise<void>;
}>('ChatBackgroundSync');

const endpoints = new Set<string>();
const consumed = new Set<string>();
const preparedStarts = new WeakMap<object, number>();
let latestTopicEventAt = 0;
const topicStateEvents = new Map<string, number>();
let finished = false;
let scope: { token: string; apiUrl: string } | undefined;
const isAndroid = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
const isStartupRead = (endpoint: string) =>
  /^\/(topics(?:\/sync)?|users)\?/.test(endpoint);

export const takeNativeStartupRead = async (
  token: string | undefined,
  apiUrl: string | undefined,
  endpoint: string
): Promise<{ available: boolean; data?: unknown }> => {
  if (!isAndroid() || finished || !token || !apiUrl || !isStartupRead(endpoint))
    return { available: false };
  if (!scope || scope.token !== token || scope.apiUrl !== apiUrl) {
    endpoints.clear();
    consumed.clear();
    scope = { token, apiUrl };
  }
  const readScope = scope;
  if (consumed.has(endpoint)) return { available: false };
  consumed.add(endpoint);
  try {
    performance.mark('chat-startup:native-read-requested');
    let result = await takePreparedStartupRead(token, apiUrl, endpoint);
    if (!result.available)
      result = await native.takeStartupRead({ token, apiUrl, endpoint });
    if (scope !== readScope) return { available: false };
    if (
      result.available &&
      (!result.startedAt ||
        (endpoint.startsWith('/topics') &&
          hasNewerTopicEvent(endpoint, result.data, result.startedAt)))
    ) {
      performance.mark('chat-startup:native-read-rejected', {
        detail: { reason: result.startedAt ? 'topic-event' : 'missing-start' }
      });
      return { available: false };
    }
    if (result.available && result.data && typeof result.data === 'object')
      preparedStarts.set(result.data, result.startedAt!);
    if (result.available) performance.mark('chat-startup:native-read-applied');
    return result;
  } catch {
    return { available: false };
  }
};

export const nativeStartupReadStartedAt = (
  result: object
): number | undefined => preparedStarts.get(result);

const hasNewerTopicEvent = (
  endpoint: string,
  data: unknown,
  startedAt: number
): boolean => {
  if (latestTopicEventAt >= startedAt) return true;
  const changedIds = [...topicStateEvents]
    .filter(([, at]) => at >= startedAt)
    .map(([id]) => id);
  if (!changedIds.length) return false;
  const page = data as {
    data?: Array<{ id?: string }>;
    unreadTopics?: unknown;
  };
  // Дельта и общая сводка непрочитанных затрагивают весь список.
  if (
    endpoint.startsWith('/topics/sync?') ||
    !Array.isArray(page?.data) ||
    page.unreadTopics !== undefined
  )
    return true;
  // Прочтение/реакция не меняют состав и порядок страниц старого API.
  return page.data.some(topic => !topic?.id || changedIds.includes(topic.id));
};

export const recordNativeStartupTopicEvent = (topicId?: string): void => {
  if (!isAndroid() || finished) return;
  if (topicId) topicStateEvents.set(topicId, Date.now());
  else latestTopicEventAt = Date.now();
};

export const rememberNativeStartupRead = (
  endpoint: string,
  token: string | undefined,
  apiUrl: string | undefined
): void => {
  if (
    isAndroid() &&
    !finished &&
    scope?.token === token &&
    scope?.apiUrl === apiUrl &&
    isStartupRead(endpoint)
  )
    endpoints.add(endpoint);
};

export const rememberNativeTopicSync = (sync: TopicSyncState): void => {
  if (!isAndroid() || finished) return;
  for (const endpoint of endpoints)
    if (endpoint.startsWith('/topics?') || endpoint.startsWith('/topics/sync?'))
      endpoints.delete(endpoint);
  endpoints.add(topicSyncEndpoint(sync));
};

export const finishNativeStartupReads = (): void => {
  if (!isAndroid() || finished) return;
  finished = true;
  topicStateEvents.clear();
  delete window.__chatNativePreparedReads;
  if (!scope || !endpoints.size) return;
  // Поздние страницы старого API содержат обычные чаты: запускаем их сразу.
  const users = [...endpoints].filter(endpoint =>
    endpoint.startsWith('/users?')
  );
  const topics = [...endpoints].filter(endpoint =>
    endpoint.startsWith('/topics')
  );
  const first = topics.shift();
  void native
    .saveStartupReadPlan({
      ...scope,
      endpoints: [
        ...users.slice(0, 1),
        ...(first ? [first] : []),
        ...topics.reverse()
      ].slice(0, 5)
    })
    .catch(() => undefined);
};
