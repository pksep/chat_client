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

export const normalizeStickerPackOrder = (value: unknown): string[] =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id): id is string =>
              typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)
          )
        )
      ].slice(0, 1000)
    : [];

export const normalizeHiddenStickerPacks = (value: unknown): string[] =>
  normalizeStickerPackOrder(value).sort();

export const stickerPackOrder = computed(() =>
  normalizeStickerPackOrder(readExtra(getAuthUser()?.ex).stickerPackOrder)
);

export const orderStickerPacks = <T extends { id: string }>(
  packs: readonly T[],
  order: readonly string[] = stickerPackOrder.value
): T[] => {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...packs].sort(
    (a, b) =>
      (positions.get(a.id) ?? order.length) -
      (positions.get(b.id) ?? order.length)
  );
};

// Новые наборы видны по умолчанию; скрываем только явно отключённые пользователем.
export const hiddenStickerPacks = computed(() =>
  normalizeHiddenStickerPacks(readExtra(getAuthUser()?.ex).hiddenStickerPacks)
);

export const saveStickerPreferences = async (preferences: {
  hiddenStickerPacks?: string[];
  stickerPackOrder?: string[];
}) => {
  const user = getAuthUser();
  const sdk = getChatSDK();
  if (!user?.id || !sdk) throw new Error('Не удалось определить пользователя');
  const ex = {
    ...(preferences.hiddenStickerPacks !== undefined
      ? {
          hiddenStickerPacks: normalizeHiddenStickerPacks(
            preferences.hiddenStickerPacks
          )
        }
      : {}),
    ...(preferences.stickerPackOrder !== undefined
      ? {
          stickerPackOrder: normalizeStickerPackOrder(
            preferences.stickerPackOrder
          )
        }
      : {})
  };
  const updated = await sdk.updateUserProfile(user.id, {
    ex
  });
  if (
    updated?.id !== user.id ||
    !Object.keys(ex).every(key => key in readExtra(updated.ex))
  )
    throw new Error('Не удалось сохранить выбор стикеров');
  if (getAuthUser()?.id !== user.id) return;
  mergeAuthUser({
    ex: { ...readExtra(getAuthUser()?.ex), ...readExtra(updated.ex) }
  });
};

export const saveHiddenStickerPacks = (ids: string[]) =>
  saveStickerPreferences({ hiddenStickerPacks: ids });
