import { onMounted, onUnmounted, readonly, ref, watch, type Ref } from 'vue';
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
let checkedToken: string | null | undefined;

interface ChatAccessState {
  access: Readonly<Ref<Readonly<ChatAccessValues>>>;
  ready: Readonly<Ref<boolean>>;
  settled: Readonly<Ref<boolean>>;
  cachedMenuCount: Readonly<Ref<number | null>>;
}

function invalidateAccessCheck(): void {
  version++;
  controller?.abort();
  controller = undefined;
  pending = undefined;
  ready.value = false;
}

function resetChatAccess(): void {
  invalidateAccessCheck();
  checkedToken = undefined;
  settled.value = false;
  cachedMenuCount.value = readMenuLayout(
    authedUser.value?.id,
    getConfig().CHAT_API_DOMAIN
  );
  access.value = { client: false, ai: false };
}

function applyChatAccess(
  values: ChatAccessValues,
  userId: string,
  base: string
): void {
  access.value = { client: values.client, ai: values.ai };
  ready.value = true;
  cachedMenuCount.value = 3 + Number(values.client) + Number(values.ai);
  saveMenuLayout(userId, base, cachedMenuCount.value);
}

watch(
  () => access.value.ai,
  allowed => {
    if (!allowed) aiController.abort();
    else aiController = new AbortController();
  },
  { flush: 'sync' }
);

watch(
  [() => authedUser.value?.id, () => getConfig().CHAT_API_DOMAIN],
  (): void => {
    resetChatAccess();

    if (subscribers) void refreshChatAccess();
  },
  { flush: 'sync' }
);

watch(
  [
    () => parseUserEx(authedUser.value?.ex).erpRoleId,
    () => parseUserEx(authedUser.value?.ex).erpRole,
    () => parseUserEx(authedUser.value?.ex).isDeletedBot
  ],
  (): void => {
    invalidateAccessCheck();

    // Обновление роли того же профиля ещё не означает отзыв персональных прав.
    if (parseUserEx(authedUser.value?.ex).isDeletedBot) {
      access.value = { client: false, ai: false };
    }

    if (subscribers) void refreshChatAccess();
  },
  { flush: 'sync' }
);

export function refreshChatAccess(): Promise<void> {
  const userId = authedUser.value?.id;
  const base = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  const token = getAuthToken() || getStoredChatAccessToken();

  if (checkedToken !== token) {
    resetChatAccess();
    checkedToken = token;
  }

  if (!userId || !base || !token) {
    access.value = { client: false, ai: false };
    ready.value = false;
    settled.value = true;

    return Promise.resolve();
  }

  if (pending) return pending;

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

      if (version !== currentVersion) return;

      if (response.status === 401 || response.status === 403) {
        applyChatAccess({ client: false, ai: false }, userId, base);

        return;
      }

      if (!response.ok) throw new Error('Не удалось проверить доступ');

      const data: ChatUserAccess = await response.json();
      if (
        data?.userId !== userId ||
        typeof data.effective?.client !== 'boolean' ||
        typeof data.effective?.ai !== 'boolean'
      )
        throw new Error('Некорректные права доступа');

      if (version === currentVersion) {
        applyChatAccess(data.effective, userId, base);
      }
    } catch {
      if (version === currentVersion) {
        // Последний подтверждённый снимок сохраняет меню, но не разрешает действие.
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
  if (checkedToken !== (getAuthToken() || getStoredChatAccessToken())) {
    await refreshChatAccess();
  } else if (pending) await pending;
  else if (!ready.value) await refreshChatAccess();

  if (!ready.value) {
    throw new Error(
      'Не удалось проверить доступ к ИИ-ассистенту. Попробуйте ещё раз.'
    );
  }

  if (!access.value.ai) throw new Error('Нет доступа к ИИ-ассистенту');
}

export const useChatAccess = (): ChatAccessState => ({
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

const refreshOnFocus = (): void => {
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
      resetChatAccess();
    }
  });
}
