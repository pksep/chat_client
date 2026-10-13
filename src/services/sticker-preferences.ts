import { computed } from 'vue';
import { getAuthUser, mergeAuthUser } from '../composables/useAuth';
import { getChatSDK } from './useChat';

const readExtra = (value: unknown): Record<string, unknown> => {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
};

export const normalizeHiddenStickerPacks = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
          )
        )
      ]
        .slice(0, 1000)
        .sort()
    : [];

// Новые наборы видны по умолчанию; скрываем только явно отключённые пользователем.
export const hiddenStickerPacks = computed(() =>
  normalizeHiddenStickerPacks(readExtra(getAuthUser()?.ex).hiddenStickerPacks)
);

export const saveHiddenStickerPacks = async (ids: string[]) => {
  const user = getAuthUser();
  const sdk = getChatSDK();
  if (!user?.id || !sdk) throw new Error('Не удалось определить пользователя');
  const hidden = normalizeHiddenStickerPacks(ids);
  const updated = await sdk.updateUserProfile(user.id, {
    ex: { hiddenStickerPacks: hidden }
  });
  if (
    updated?.id !== user.id ||
    !('hiddenStickerPacks' in readExtra(updated.ex))
  )
    throw new Error('Не удалось сохранить выбор стикеров');
  if (getAuthUser()?.id !== user.id) return;
  mergeAuthUser({
    ex: { ...readExtra(getAuthUser()?.ex), ...readExtra(updated.ex) }
  });
};
