import { onMounted, onUnmounted, ref, watch } from 'vue';
import {
  authedUser,
  fetchWithAuthRedirect,
  getStoredChatAccessToken
} from './useAuth';
import { getAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';

const allowed = ref(false);
const resolved = ref(false);
let subscribers = 0;
let refreshPromise: Promise<void> | null = null;
let generation = 0;
let interval: ReturnType<typeof setInterval> | undefined;
let stopWatch: (() => void) | undefined;

/** Запрашивает у Chat-сервера актуальный персональный допуск к AI. */
export async function refreshAiAccess(): Promise<void> {
  if (!authedUser.value?.id) return;
  if (refreshPromise) return refreshPromise;

  const currentGeneration = generation;
  refreshPromise = (async (): Promise<void> => {
    try {
      const base = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
      const token = getAuthToken() || getStoredChatAccessToken();

      if (!base || !token) return;

      const response = await fetchWithAuthRedirect(`${base}/ai/access`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`AI access request failed with ${response.status}`);
      }

      const result: unknown = await response.json();

      if (
        typeof result !== 'object' ||
        result === null ||
        !('allowed' in result) ||
        typeof result.allowed !== 'boolean'
      ) {
        throw new Error('AI access response is invalid');
      }

      if (currentGeneration !== generation) return;

      allowed.value = result.allowed === true;
      resolved.value = true;
    } catch (error) {
      // A transport failure is not presented to the user as an administrator denial.
      console.warn('Failed to refresh AI access:', error);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Поддерживает общий для меню и маршрутов снимок доступа к AI. */
export function useAiAccessSubscription(): void {
  onMounted((): void => {
    if (subscribers++ > 0) return;

    stopWatch = watch(
      [() => authedUser.value?.id, () => getConfig().CHAT_API_DOMAIN],
      (): void => {
        generation += 1;
        allowed.value = false;
        resolved.value = false;
        void (refreshPromise || Promise.resolve()).then(refreshAiAccess);
      },
      { immediate: true }
    );
    interval = setInterval((): void => void refreshAiAccess(), 10000);
  });

  onUnmounted((): void => {
    if (--subscribers > 0) return;

    stopWatch?.();
    clearInterval(interval);
    generation += 1;
    allowed.value = false;
    resolved.value = false;
  });
}

/** Возвращает реактивный персональный допуск к AI. */
export function useAiAccess(): {
  allowed: typeof allowed;
  resolved: typeof resolved;
  refresh: typeof refreshAiAccess;
} {
  return {
    allowed,
    resolved,
    refresh: refreshAiAccess
  };
}
