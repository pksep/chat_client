import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  authedUser,
  getStoredChatAccessToken,
  fetchWithAuthRedirect
} from './useAuth';
import { getAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';
import { getTopicList } from './useTopics';
import type { ITopic, IUser } from '../components/interfaces/interfaces';

export interface ManagerInquiry {
  id: string;
  topic_id: string;
  guest_user_id: string | null;
  avatar_url: string | null;
  name: string;
  contacts: { name?: string; phone?: string; email?: string };
  source: { channel?: string; name?: string; pageUrl?: string };
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
export class ManagerRequestError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

const inquiries = ref<ManagerInquiry[]>([]);
const managers = ref<ManagerOption[]>([]);
const allowed = ref(false);
const loading = ref(false);
const error = ref('');
let subscribers = 0;
let refreshPromise: Promise<void> | null = null;
let generation = 0;
let interval: ReturnType<typeof setInterval> | undefined;
let scheduled: ReturnType<typeof setTimeout> | undefined;
let stopWatch: (() => void) | undefined;
let stopTopics: (() => void) | undefined;

export async function managerRequest<T>(
  path: string,
  body?: unknown
): Promise<T> {
  const base = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!base || !token) throw new Error('Требуется подключение к чату');
  const response = await fetchWithAuthRedirect(`${base}/manager/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 403 && path !== 'access') {
      // Отсутствие права синхронизации с ЕРП не закрывает сам раздел обращений.
      const access = await managerRequest<{ allowed: boolean }>('access').catch(
        () => null
      );
      if (access?.allowed === false) {
        allowed.value = false;
        inquiries.value = [];
        managers.value = [];
      }
    }
    throw new ManagerRequestError(
      data.message || 'Не удалось выполнить действие',
      response.status
    );
  }
  return data as T;
}

export function isClientTopic(topic?: ITopic | null): boolean {
  return (
    topic?.group?.description === 'sep-chat:external-inquiry:v1' ||
    !!inquiries.value.find(item => item.topic_id === topic?.id)
  );
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
    vkontakte: 'ВКонтакте'
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
  if (!authedUser.value?.id) return;
  if (refreshPromise) return refreshPromise;
  const currentGeneration = generation;
  loading.value = !inquiries.value.length;
  refreshPromise = (async () => {
    try {
      const access = await managerRequest<{ allowed: boolean }>('access');
      if (currentGeneration !== generation) return;
      allowed.value = access.allowed;
      if (!access.allowed) {
        inquiries.value = [];
        managers.value = [];
        error.value = '';
        return;
      }
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
      error.value = '';
    } catch (cause) {
      if (currentGeneration === generation)
        error.value =
          cause instanceof Error
            ? cause.message
            : 'Не удалось загрузить заявки';
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
        inquiries.value = [];
        managers.value = [];
        allowed.value = false;
        error.value = '';
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
    inquiries.value = [];
    managers.value = [];
    allowed.value = false;
  });
}

export function useManagerInquiries() {
  return {
    inquiries,
    managers,
    allowed,
    loading,
    error,
    byTopic: computed(
      () => new Map(inquiries.value.map(item => [item.topic_id, item]))
    ),
    refresh: refreshManagerInquiries
  };
}
