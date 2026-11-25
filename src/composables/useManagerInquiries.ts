import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  authedUser,
  getStoredChatAccessToken,
  fetchWithAuthRedirect
} from './useAuth';
import { getAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';
import { getTopicList } from './useTopics';
import { clearManagerRoutes } from './useManagerRoutes';
import { showErrorNotification } from './useNotifications';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { useChatAccess } from './useChatAccess';
import { hasInquiryTopicMarker } from '../utils/inquiry-message-visibility';
import { recordErrorRequest } from '../services/error-notification-telemetry';
import { generateUUID } from '../utils/generateUUID';
import {
  forgetWidgetSettingsDraft,
  readWidgetSettingsDrafts,
  rememberWidgetSettingsDraft,
  serializeWidgetSettings,
  type PendingWidgetSettings
} from '../utils/widget-settings-drafts';

export interface ManagerInquiry {
  id: string;
  topic_id: string;
  guest_user_id: string | null;
  avatar_url: string | null;
  name: string;
  contacts: { name?: string; phone?: string; email?: string };
  source: { channel?: string; name?: string; pageUrl?: string };
  channels?: string[];
  manager_ids: string[];
  assignee_id: string | null;
  note: string;
  metadata_version: number;
  erp_contact_id: number | null;
  created_at: string;
}
export interface InquiryDetail {
  inquiry: ManagerInquiry;
  erpOperations: Array<{ id: string; state: string; last_error?: string }>;
}
export interface ManagerOption {
  id: string;
  initials: string;
  nickname?: string;
  avatarUrl?: string;
}

export interface WidgetSite {
  id: string;
  name: string;
}

export class ManagerRequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public accessDenied = false
  ) {
    super(message);
  }
}

const inquiries = ref<ManagerInquiry[]>([]);
const managers = ref<ManagerOption[]>([]);
const allowed = ref(false);
const resolved = ref(false);
const widgetSettingsAvailability = ref<
  'checking' | 'available' | 'unavailable'
>('checking');
const { access: chatAccess, ready: isChatAccessReady } = useChatAccess();
watch(
  [() => chatAccess.value.client, isChatAccessReady],
  ([granted, ready]): void => {
    generation++;
    widgetSettingsAvailability.value = 'checking';
    resolved.value = ready && !granted;
    if (granted) {
      void refreshManagerInquiries();
      return;
    }
    clearManagerRoutes();
    allowed.value = false;
    inquiries.value = [];
    managers.value = [];
  }
);
const loading = ref(false);
let subscribers = 0;
let refreshPromise: Promise<void> | null = null;
let generation = 0;
let interval: ReturnType<typeof setInterval> | undefined;
let scheduled: ReturnType<typeof setTimeout> | undefined;
let stopWatch: (() => void) | undefined;
let stopTopics: (() => void) | undefined;
let lastRefreshError = '';

const managerRequestErrorMessage = (status: number): string => {
  if (status === 403) return 'Нет доступа к разделу «Клиенты»';
  if (status === 404) return 'Данные обращения не найдены';
  if (status === 409) return 'Данные обращения изменились другим менеджером';
  return 'Не удалось выполнить действие. Попробуйте ещё раз.';
};

const notifyRefreshError = (cause: unknown): void => {
  const message =
    cause instanceof Error ? cause.message : 'Не удалось загрузить обращения';

  if (message === lastRefreshError) return;

  lastRefreshError = message;
  showErrorNotification(message, {
    error: cause,
    source: 'manager.inquiries.refresh'
  });
};

function revokeManagerAccess(): void {
  clearManagerRoutes();
  allowed.value = false;
  widgetSettingsAvailability.value = 'checking';
  resolved.value = true;
  inquiries.value = [];
  managers.value = [];
}

export async function managerRequest<T>(
  path: string,
  body?: unknown,
  options: { keepalive?: boolean; timeoutMs?: number } = {}
): Promise<T> {
  const base = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!base || !token) throw new Error('Требуется подключение к чату');
  const actorId = authedUser.value?.id;
  const requestGeneration = generation;
  const isCurrentRequest = (): boolean =>
    requestGeneration === generation &&
    actorId === authedUser.value?.id &&
    base === getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '') &&
    token === (getAuthToken() || getStoredChatAccessToken());

  const url = `${base}/manager/${path}`;
  const method = body === undefined ? 'GET' : 'POST';
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 20_000;
  let response: Response;
  const recordFailure = (
    error: unknown,
    phase: 'request' | 'response_body' | 'http_status'
  ): void =>
    recordErrorRequest(error, {
      source: 'managerRequest',
      url,
      method,
      elapsedMs: Date.now() - startedAt,
      timeoutMs,
      httpStatus: response?.status,
      phase
    });

  try {
    response = await fetchWithAuthRedirect(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      ...(options.keepalive ? { keepalive: true } : {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
    const data = await response.json().catch(error => {
      recordFailure(error, 'response_body');
      return {};
    });

    if (!response.ok) {
      let accessDenied = response.status === 403 && path === 'access';

      if (response.status === 403 && path !== 'access' && isCurrentRequest()) {
        // Отказ на отдельное действие не означает отзыв права на весь раздел.
        const access = await managerRequest<{ allowed: boolean }>(
          'access'
        ).catch((cause: unknown): { allowed: false } | null =>
          cause instanceof ManagerRequestError && cause.accessDenied
            ? { allowed: false }
            : null
        );
        accessDenied = access?.allowed === false;
      }

      if (accessDenied && isCurrentRequest()) revokeManagerAccess();

      throw new ManagerRequestError(
        response.status === 403 && !accessDenied
          ? 'Нет доступа к этому действию'
          : managerRequestErrorMessage(response.status),
        response.status,
        accessDenied
      );
    }
    return data as T;
  } catch (error) {
    recordFailure(error, response ? 'http_status' : 'request');
    throw error;
  }
}

let widgetSitesRequest:
  | { generation: number; promise: Promise<WidgetSite[]> }
  | undefined;

/** Список сайтов подтверждает связь с Manager, а не только право в Чате. */
export function loadWidgetSites(): Promise<WidgetSite[]> {
  if (!allowed.value || !chatAccess.value.client)
    return Promise.reject(new Error('Нет доступа к настройкам виджета'));
  if (widgetSitesRequest?.generation === generation)
    return widgetSitesRequest.promise;

  const currentGeneration = generation;
  const promise = managerRequest<WidgetSite[]>('widget-sites', undefined, {
    timeoutMs: 5_000
  })
    .then((sites): WidgetSite[] => {
      if (!Array.isArray(sites)) throw new Error('Некорректный список сайтов');
      if (currentGeneration !== generation)
        throw new Error('Подключение к Чату изменилось');
      widgetSettingsAvailability.value = 'available';

      return sites;
    })
    .catch((cause: unknown): never => {
      if (currentGeneration === generation)
        widgetSettingsAvailability.value = 'unavailable';

      throw cause;
    })
    .finally((): void => {
      if (widgetSitesRequest?.generation === currentGeneration)
        widgetSitesRequest = undefined;
    });
  widgetSitesRequest = { generation: currentGeneration, promise };

  return promise;
}

export function isClientTopic(topic?: ITopic | null): boolean {
  return (
    hasInquiryTopicMarker(topic) ||
    !!inquiries.value.find(item => item.topic_id === topic?.id)
  );
}

const pendingWidgetWrites = new Set<string>();
const widgetSettingsRecovery = new Map<string, Promise<void>>();

function getWidgetDraftKey(): string | undefined {
  const userId = authedUser.value?.id;
  const server = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  if (!userId || !server) return undefined;

  return JSON.stringify(['sep:widget-settings-draft', server, userId]);
}

function widgetSettingsPath(siteId: string): string {
  return `widget-sites/${encodeURIComponent(siteId)}`;
}

export async function saveWidgetSettings<T>(
  siteId: string,
  body: PendingWidgetSettings['body']
): Promise<T> {
  const key = getWidgetDraftKey();
  const id = generateUUID();
  if (key) rememberWidgetSettingsDraft(key, { id, siteId, body });

  pendingWidgetWrites.add(id);
  try {
    const keepalive =
      new TextEncoder().encode(JSON.stringify(body)).length <= 60_000;
    const updated = await managerRequest<T>(widgetSettingsPath(siteId), body, {
      keepalive
    });
    if (key) forgetWidgetSettingsDraft(key, id);

    return updated;
  } catch (cause) {
    if (
      key &&
      cause instanceof ManagerRequestError &&
      [400, 403, 404, 409].includes(cause.status)
    )
      forgetWidgetSettingsDraft(key, id);
    throw cause;
  } finally {
    pendingWidgetWrites.delete(id);
  }
}

export function recoverWidgetSettings(): Promise<void> {
  const key = getWidgetDraftKey();
  if (!key || !allowed.value || !chatAccess.value.client)
    return Promise.resolve();
  const recovery = widgetSettingsRecovery.get(key);
  if (recovery) return recovery;
  const drafts = readWidgetSettingsDrafts(key).filter(
    draft => !pendingWidgetWrites.has(draft.id)
  );
  if (!drafts.length) return Promise.resolve();

  const pending = (async (): Promise<void> => {
    for (const draft of drafts) {
      if (
        key !== getWidgetDraftKey() ||
        !allowed.value ||
        !chatAccess.value.client
      )
        return;
      const path = widgetSettingsPath(draft.siteId);
      try {
        await managerRequest(path, draft.body);
        forgetWidgetSettingsDraft(key, draft.id);
      } catch (cause) {
        if (
          !(cause instanceof ManagerRequestError) ||
          ![400, 403, 404, 409].includes(cause.status)
        )
          continue;
        if (cause.status === 409 && key === getWidgetDraftKey()) {
          const current = await managerRequest<{ settings: unknown }>(
            path
          ).catch(() => null);
          if (!current) continue;
          if (
            serializeWidgetSettings(current.settings) ===
            serializeWidgetSettings(draft.body.settings)
          ) {
            forgetWidgetSettingsDraft(key, draft.id);
            continue;
          }
        }
        forgetWidgetSettingsDraft(key, draft.id);
        if (key === getWidgetDraftKey())
          showErrorNotification(
            'Не удалось восстановить автосохранение виджета. Проверьте настройки.'
          );
      }
    }
  })().finally(() => widgetSettingsRecovery.delete(key));
  widgetSettingsRecovery.set(key, pending);

  return pending;
}
export const clientName = (item: ManagerInquiry): string => {
  const name = item.contacts?.name || item.name || 'Клиент';
  return item.contacts?.phone ? `${name} (${item.contacts.phone})` : name;
};
export const clientPlatform = (item: ManagerInquiry): string =>
  ({
    widget: 'Сайт',
    site: 'Сайт',
    avito: 'Авито',
    vk: 'ВКонтакте',
    vkontakte: 'ВКонтакте',
    telegram: 'Telegram',
    max: 'MAX',
    whatsapp: 'WhatsApp'
  })[item.source?.channel || 'widget'] ||
  item.source?.name ||
  'Сайт';
export const clientUser = (item: ManagerInquiry): IUser =>
  ({
    id: item.guest_user_id || '',
    initials: clientName(item),
    avatarUrl: item.avatar_url || '',
    nickname: '',
    isExternal: true,
    lastOnline: null,
    deletedAt: null,
    createdAt: new Date(item.created_at),
    updatedAt: new Date(item.created_at)
  }) as IUser;

function mergeInquiry(item: ManagerInquiry) {
  const index = inquiries.value.findIndex(row => row.id === item.id);
  if (index < 0) inquiries.value.unshift(item);
  else if (item.metadata_version >= inquiries.value[index].metadata_version)
    inquiries.value[index] = item;
}

export async function refreshManagerInquiries(): Promise<void> {
  if (!authedUser.value?.id || !chatAccess.value.client) return;
  if (refreshPromise) return refreshPromise;
  const currentGeneration = generation;
  loading.value = !inquiries.value.length;
  refreshPromise = (async () => {
    let accessChecked = false;

    try {
      const access = await managerRequest<{ allowed: boolean }>('access');
      if (currentGeneration !== generation) return;
      accessChecked = true;
      allowed.value = access.allowed;
      resolved.value = true;
      if (!access.allowed) {
        widgetSettingsAvailability.value = 'checking';
        clearManagerRoutes();
        inquiries.value = [];
        managers.value = [];
        lastRefreshError = '';
        return;
      }
      void loadWidgetSites().catch((): void => {});
      void recoverWidgetSettings();
      const rows: ManagerInquiry[] = [];
      for (let page = 1; ; page++) {
        const batch = await managerRequest<ManagerInquiry[]>(
          `inquiries?page=${page}`
        );
        if (currentGeneration !== generation) return;
        rows.push(...batch);
        if (batch.length < 100) break;
      }
      const people = await managerRequest<ManagerOption[]>('managers');
      if (currentGeneration !== generation) return;
      // A metadata save can finish while the list request is in flight.
      const existing = new Map(inquiries.value.map(item => [item.id, item]));
      inquiries.value = rows.map(item => {
        const previous = existing.get(item.id);
        return previous && previous.metadata_version > item.metadata_version
          ? previous
          : item;
      });
      managers.value = people;
      lastRefreshError = '';
    } catch (cause) {
      if (currentGeneration !== generation) return;

      if (cause instanceof ManagerRequestError && cause.accessDenied) {
        lastRefreshError = '';

        return;
      }

      if (!accessChecked) widgetSettingsAvailability.value = 'unavailable';
      notifyRefreshError(cause);
    } finally {
      if (currentGeneration === generation) loading.value = false;
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export async function loadInquiry(id: string): Promise<InquiryDetail> {
  const actor = authedUser.value?.id;
  const data = await managerRequest<InquiryDetail>(`inquiries/${id}`);
  if (actor === authedUser.value?.id) mergeInquiry(data.inquiry);
  return data;
}

export async function saveInquiryMetadata(
  item: ManagerInquiry,
  patch: { managerIds?: string[]; note?: string },
  version = item.metadata_version
) {
  const actor = authedUser.value?.id;
  const result = await managerRequest<{
    managerIds: string[];
    note: string;
    version: number;
    assigneeId: string | null;
  }>(`inquiries/${item.id}/metadata`, { ...patch, version });
  if (actor === authedUser.value?.id)
    mergeInquiry({
      ...item,
      manager_ids: result.managerIds,
      note: result.note,
      metadata_version: result.version,
      assignee_id: result.assigneeId
    });
  return result;
}

/** One subscription shared by desktop/mobile navigation; clears private state on account change. */
export function useManagerInboxSubscription() {
  onMounted(() => {
    if (subscribers++ > 0) return;
    stopWatch = watch(
      // Обновление профиля того же сотрудника не сбрасывает подтверждённый доступ.
      [() => authedUser.value?.id, () => getConfig().CHAT_API_DOMAIN],
      () => {
        generation++;
        clearManagerRoutes();
        inquiries.value = [];
        managers.value = [];
        allowed.value = false;
        resolved.value = false;
        widgetSettingsAvailability.value = 'checking';
        lastRefreshError = '';
        void (refreshPromise || Promise.resolve()).then(
          refreshManagerInquiries
        );
      },
      { immediate: true }
    );
    stopTopics = watch(
      () =>
        getTopicList()
          .filter(isClientTopic)
          .map(topic => `${topic.id}:${topic.lastMessage?.id}`)
          .join(','),
      () => {
        clearTimeout(scheduled);
        scheduled = setTimeout(() => void refreshManagerInquiries(), 400);
      }
    );
    interval = setInterval(() => void refreshManagerInquiries(), 10000);
  });
  onUnmounted(() => {
    if (--subscribers > 0) return;
    stopWatch?.();
    stopTopics?.();
    clearInterval(interval);
    clearTimeout(scheduled);
    generation++;
    clearManagerRoutes();
    inquiries.value = [];
    managers.value = [];
    allowed.value = false;
    resolved.value = false;
    widgetSettingsAvailability.value = 'checking';
  });
}

export function useManagerInquiries() {
  return {
    inquiries,
    managers,
    allowed: computed(
      () => chatAccess.value.client && (!resolved.value || allowed.value)
    ),
    resolved,
    widgetSettingsAvailability: computed(
      () => widgetSettingsAvailability.value
    ),
    loading,
    byTopic: computed(
      () => new Map(inquiries.value.map(item => [item.topic_id, item]))
    ),
    refresh: refreshManagerInquiries
  };
}
