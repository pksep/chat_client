import { reactive } from 'vue';
import { managerRequest, useManagerInquiries } from './useManagerInquiries';
import { getAuthToken } from './useLogin';
import {
  authedUser,
  getStoredChatAccessToken,
  fetchWithAuthRedirect
} from './useAuth';
import { getConfig } from '../services/useConfig';

export interface ManagerRoute {
  id: string;
  channel: 'widget' | 'vk' | 'avito';
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

export interface ChannelDelivery {
  id: string;
  route_id: string;
  channel: 'vk' | 'avito';
  state: 'pending' | 'working' | 'delivered' | 'failed' | 'uncertain';
  last_error?: string | null;
  sending_part?: number | null;
  confirmed_by_manager?: boolean;
}

export const managerRoutes = reactive<Record<string, ManagerRoute[]>>({});
export const managerRouteSelection = reactive<Record<string, string>>({});
export const managerDeliveries = reactive<Record<string, ChannelDelivery>>({});
let generation = 0;

export const channelLabel = (channel: string): string =>
  ({ widget: 'Сайт', vk: 'ВКонтакте', avito: 'Авито' })[channel] || 'Канал';

/** Сбрасывает приватные маршруты при смене сотрудника или отзыве права. */
export function clearManagerRoutes(): void {
  generation++;
  for (const storage of [
    managerRoutes,
    managerRouteSelection,
    managerDeliveries
  ])
    for (const key of Object.keys(storage)) delete storage[key];
}

/** Источник ответа выбирается один раз и не переключается новым входящим сообщением. */
export function selectedManagerRoute(
  topicId: string
): ManagerRoute | undefined {
  return managerRoutes[topicId]?.find(
    route => route.id === managerRouteSelection[topicId]
  );
}

/** Обновляет возможности канала и фактическое состояние доставки. */
export async function refreshManagerRoutes(
  topicId: string,
  inquiryId: string
): Promise<void> {
  const actor = authedUser.value?.id;
  const started = generation;
  const [routes, deliveries] = await Promise.all([
    managerRequest<ManagerRoute[]>(`inquiries/${inquiryId}/routes`),
    managerRequest<ChannelDelivery[]>(
      `inquiries/${inquiryId}/channel-deliveries`
    )
  ]);
  if (
    started !== generation ||
    actor !== authedUser.value?.id ||
    !useManagerInquiries().allowed.value
  )
    return;
  managerRoutes[topicId] = routes;
  if (!managerRouteSelection[topicId])
    managerRouteSelection[topicId] =
      (routes.find(route => route.canReply) || routes[0])?.id || '';
  for (const delivery of deliveries) managerDeliveries[delivery.id] = delivery;
}

/** Ограничения проверяются до очистки черновика и начала загрузки. */
export function managerSendError(
  topicId: string,
  files: File[] = []
): string | null {
  const inquiry = useManagerInquiries().byTopic.value.get(topicId);
  if (!inquiry) return null;
  const route = selectedManagerRoute(topicId);
  if (!route) return 'Дождитесь загрузки и выберите канал ответа';
  if (!route.canReply)
    return 'Этот канал сейчас недоступен. Выберите другой канал ответа';
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
  if (!response.ok)
    throw new Error('Не удалось загрузить файл для выбранного канала');
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
