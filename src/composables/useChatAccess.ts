import { onMounted, onUnmounted, readonly, ref, watch } from 'vue';
import {
  authedUser,
  getStoredChatAccessToken,
  fetchWithAuthRedirect
} from './useAuth';
import { getAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';
import type { ChatAccessValues, ChatUserAccess } from '../types/chat-access';
import { parseUserEx } from '../utils/parseUserEx';
import { readMenuLayout, saveMenuLayout } from '../utils/menu-layout-cache';

const access = ref<ChatAccessValues>({ client: false, ai: false });
const ready = ref(false);
const settled = ref(false);
const cachedMenuCount = ref<number | null>(null);
let version = 0;
let pending: Promise<void> | undefined;
let controller: AbortController | undefined;
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let aiController = new AbortController();

watch(
  () => access.value.ai,
  allowed => {
    if (!allowed) aiController.abort();
    else aiController = new AbortController();
  },
  { flush: 'sync' }
);

watch(
  [
    () => authedUser.value?.id,
    () => parseUserEx(authedUser.value?.ex).erpRoleId,
    () => parseUserEx(authedUser.value?.ex).erpRole,
    () => parseUserEx(authedUser.value?.ex).isDeletedBot,
    () => getConfig().CHAT_API_DOMAIN
  ],
  () => {
    version++;
    controller?.abort();
    pending = undefined;
    ready.value = false;
    settled.value = false;
    cachedMenuCount.value = readMenuLayout(
      authedUser.value?.id,
      getConfig().CHAT_API_DOMAIN
    );
    access.value = { client: false, ai: false };
    if (subscribers) void refreshChatAccess();
  },
  { flush: 'sync' }
);

export function refreshChatAccess(): Promise<void> {
  if (pending) return pending;
  const userId = authedUser.value?.id;
  const base = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!userId || !base || !token) {
    access.value = { client: false, ai: false };
    ready.value = false;
    settled.value = true;
    return Promise.resolve();
  }
  const currentVersion = version;
  const requestController = new AbortController();
  controller = requestController;
  const timeout = setTimeout(() => requestController.abort(), 10000);
  const request = (async () => {
    try {
      const response = await fetchWithAuthRedirect(`${base}/users/me/access`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: requestController.signal
      });
      if (!response.ok) throw new Error('Не удалось проверить доступ');
      const data: ChatUserAccess = await response.json();
      if (
        data.userId !== userId ||
        typeof data.effective?.client !== 'boolean' ||
        typeof data.effective?.ai !== 'boolean'
      )
        throw new Error('Некорректные права доступа');
      if (version === currentVersion) {
        access.value = { ...data.effective };
        ready.value = true;
        cachedMenuCount.value =
          3 + Number(data.effective.client) + Number(data.effective.ai);
        saveMenuLayout(userId, base, cachedMenuCount.value);
      }
    } catch {
      if (version === currentVersion) {
        access.value = { client: false, ai: false };
        ready.value = false;
      }
    } finally {
      clearTimeout(timeout);
      if (version === currentVersion) {
        settled.value = true;
        pending = undefined;
      }
    }
  })();
  pending = request;
  return request;
}

export async function requireAiAccess(): Promise<void> {
  if (pending) await pending;
  else if (!ready.value) await refreshChatAccess();
  if (!access.value.ai) throw new Error('Нет доступа к ИИ-ассистенту');
}

export const useChatAccess = () => ({
  access: readonly(access),
  ready: readonly(ready),
  settled: readonly(settled),
  cachedMenuCount: readonly(cachedMenuCount)
});

export async function fetchWithAiAccess(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  await requireAiAccess();
  const signal = init?.signal
    ? AbortSignal.any([init.signal, aiController.signal])
    : aiController.signal;
  return fetch(input, { ...init, signal });
}

const refreshOnFocus = () => {
  void refreshChatAccess();
};

export function useChatAccessSubscription(): void {
  onMounted(() => {
    if (++subscribers === 1) {
      timer = setInterval(refreshOnFocus, 10000);
      window.addEventListener('focus', refreshOnFocus);
    }
    refreshOnFocus();
  });
  onUnmounted(() => {
    if (--subscribers === 0) {
      clearInterval(timer);
      window.removeEventListener('focus', refreshOnFocus);
      version++;
      controller?.abort();
      pending = undefined;
      ready.value = false;
      settled.value = false;
      access.value = { client: false, ai: false };
    }
  });
}
