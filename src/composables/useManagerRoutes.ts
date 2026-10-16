import { onScopeDispose, reactive, watch, type Ref } from 'vue';
import { managerRequest, useManagerInquiries } from './useManagerInquiries';
import { getAuthToken } from './useLogin';
import {
  authedUser,
  getStoredChatAccessToken,
  fetchWithAuthRedirect
} from './useAuth';
import { getConfig } from '../services/useConfig';
import { getFullMessagesByTopicId } from '../services/useMessages';
import { latestManagerReplyContext } from '../utils/managerMessageChannel';
import { showErrorNotification } from './useNotifications';

export interface ManagerRoute {
  id: string;
  channel: 'widget' | 'vk' | 'avito' | 'telegram' | 'max';
  name: string;
  title: string;
  pageUrl: string;
  canReply: boolean;
  capabilities: {
    textChars: number;
    fileBytes: number;
    fileCount: number;
    mimeTypes: string[];
    readReceipts: boolean;
  };
}

export const managerRoutes = reactive<Record<string, ManagerRoute[]>>({});
let generation = 0;

export const channelLabel = (channel: string): string =>
  ({
    widget: 'Сайт',
    vk: 'ВКонтакте',
    avito: 'Авито',
    telegram: 'Telegram',
    max: 'MAX'
  })[channel] || 'Канал';

/** Сбрасывает приватные маршруты при смене сотрудника или отзыве права. */
export function clearManagerRoutes(): void {
  generation++;
  for (const key of Object.keys(managerRoutes)) delete managerRoutes[key];
}

/** Ответ всегда направляется в конкретный маршрут последнего сообщения клиента. */
export function selectedManagerRoute(
  topicId: string
): ManagerRoute | undefined {
  const inquiry = useManagerInquiries().byTopic.value.get(topicId);
  const routes = managerRoutes[topicId] || [];
  const replyContext = latestManagerReplyContext(
    getFullMessagesByTopicId(topicId),
    inquiry?.guest_user_id
  );

  if (replyContext?.routeId) {
    return routes.find(route => route.id === replyContext.routeId);
  }

  return routes[0];
}

/** Обновляет возможности маршрутов без ручного выбора канала. */
export async function refreshManagerRoutes(
  topicId: string,
  inquiryId: string
): Promise<void> {
  const actor = authedUser.value?.id;
  const started = generation;
  const routes = await managerRequest<ManagerRoute[]>(
    `inquiries/${inquiryId}/routes`
  );
  if (
    started !== generation ||
    actor !== authedUser.value?.id ||
    !useManagerInquiries().allowed.value
  )
    return;
  managerRoutes[topicId] = routes;
}

/** Поддерживает возможности текущего автоматического маршрута актуальными. */
export function useManagerRouteSubscription(
  topicId: Readonly<Ref<string | undefined>>
): void {
  const { byTopic } = useManagerInquiries();
  let timer: ReturnType<typeof setInterval> | undefined;
  let subscriptionGeneration = 0;
  let busy = false;
  let lastError = '';

  const stop = watch(
    () => {
      const currentTopicId = topicId.value;
      const inquiryId = currentTopicId
        ? byTopic.value.get(currentTopicId)?.id
        : undefined;

      return currentTopicId && inquiryId
        ? { topicId: currentTopicId, inquiryId }
        : undefined;
    },
    target => {
      clearInterval(timer);
      subscriptionGeneration++;
      lastError = '';

      if (!target) {
        return;
      }

      const expectedGeneration = subscriptionGeneration;
      const refresh = async (): Promise<void> => {
        if (busy || expectedGeneration !== subscriptionGeneration) {
          return;
        }

        busy = true;

        try {
          await refreshManagerRoutes(target.topicId, target.inquiryId);

          if (expectedGeneration === subscriptionGeneration) {
            lastError = '';
          }
        } catch {
          const message = 'Не удалось обновить канал ответа';

          if (
            expectedGeneration === subscriptionGeneration &&
            lastError !== message
          ) {
            lastError = message;
            showErrorNotification(message);
          }
        } finally {
          busy = false;
        }
      };

      void refresh();
      timer = setInterval(() => void refresh(), 4000);
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    subscriptionGeneration++;
    clearInterval(timer);
    stop();
  });
}

/** Ограничения проверяются до очистки черновика и начала загрузки. */
export function managerSendError(
  topicId: string,
  files: File[] = []
): string | null {
  const inquiry = useManagerInquiries().byTopic.value.get(topicId);
  if (!inquiry) return null;
  const route = selectedManagerRoute(topicId);
  if (!route) return 'Не удалось определить канал последнего сообщения клиента';
  if (!route.canReply)
    return 'Канал последнего сообщения клиента сейчас недоступен';
  if (files.length > route.capabilities.fileCount)
    return `Можно отправить не больше ${route.capabilities.fileCount} вложений`;
  for (const file of files) {
    if (file.size > route.capabilities.fileBytes)
      return `Файл «${file.name}» превышает допустимый размер для ${channelLabel(route.channel)}`;
    if (
      !route.capabilities.mimeTypes.includes('*') &&
      !route.capabilities.mimeTypes.includes(file.type)
    )
      return `Файл «${file.name}» не поддерживается в ${channelLabel(route.channel)}`;
  }
  return null;
}

/** Загружает файл в существующее приватное хранилище обращения с фиксированным адресатом. */
export async function uploadManagerFile(
  topicId: string,
  routeId: string,
  operationId: string,
  file: File
): Promise<string> {
  const inquiry = useManagerInquiries().byTopic.value.get(topicId);
  if (!inquiry) throw new Error('Обращение не найдено');
  const body = new FormData();
  body.set('operationId', operationId);
  body.set('file', file, file.name);
  const base = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  const response = await fetchWithAuthRedirect(
    `${base}/manager/inquiries/${inquiry.id}/attachments?routeId=${encodeURIComponent(routeId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getAuthToken() || getStoredChatAccessToken()}`
      },
      body,
      signal: AbortSignal.timeout(60000)
    }
  );
  if (!response.ok) throw new Error('Не удалось загрузить файл в канал ответа');
  const result = (await response.json()) as { id: string };
  if (!/^[0-9a-f-]{36}$/i.test(result.id))
    throw new Error('Сервис не подтвердил загрузку');
  return `manager-private/${result.id}`;
}

/** Стабильный ID загрузки сохраняется при повторах одного вложения. */
export async function managerUploadId(
  messageId: string,
  fileId: string
): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${messageId}:${fileId}`)
    )
  );
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes.slice(0, 16), value =>
    value.toString(16).padStart(2, '0')
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
