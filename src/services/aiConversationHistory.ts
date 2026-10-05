import { fetchWithAiAccess } from '../composables/useChatAccess';
import { z } from 'zod';
import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getAiErrorMessage } from './aiErrorMessages';
import {
  loadAiConversationTranscript,
  type AiMessagePresentation
} from './aiConversationTranscript';
import type { AiAttachmentReference } from './aiAttachments';

const stateSchema = z.object({
  generation: z.number().int().nonnegative(),
  deleted: z.boolean(),
  protocol: z.union([z.literal(0), z.literal(1)]).optional()
});
export type AiConversationState = z.infer<typeof stateSchema>;
export interface AiConversationReset {
  generation: number;
  operationId: string;
}
export type AiHistoryMutation = AiConversationReset &
  (
    | {
        action: 'delete';
        messageIds: string[];
      }
    | {
        action: 'edit';
        messageId: string;
        text: string;
        messagePresentation?: AiMessagePresentation;
        attachments: AiAttachmentReference[];
      }
  );

const endpoint = (baseUrl: string, chatId: string) =>
  `${baseUrl.replace(/\/+$/, '').replace(/\/api$/, '')}/conversations/${encodeURIComponent(chatId)}`;

async function requestBody(url: string, input?: unknown): Promise<unknown> {
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!token) throw new Error('Требуется авторизация.');
  const response = await fetchWithAiAccess(url, {
    method: input ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(input ? { 'Content-Type': 'application/json' } : {})
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(getAiErrorMessage({ status: response.status, body }));
  return body;
}

async function request(
  url: string,
  input?: AiConversationReset
): Promise<AiConversationState> {
  const state = stateSchema.safeParse(await requestBody(url, input));
  if (!state.success)
    throw new Error(
      'Не удалось проверить серверную историю. Обновите чат; сохранённые сообщения не удалены.'
    );
  return state.data;
}

/** Сверяет версию истории, не создавая чат повторно после его удаления. */
export const fetchAiConversationState = (baseUrl: string, chatId: string) =>
  request(endpoint(baseUrl, chatId));

/** Вызывается только для нового чата. Проверять отсутствие старой истории обязан сервер. */
export async function initializeAiConversation(
  baseUrl: string,
  chatId: string,
  generation: number
): Promise<AiConversationState> {
  const result = stateSchema.safeParse(
    await requestBody(`${endpoint(baseUrl, chatId)}/initialize`, { generation })
  );
  if (
    !result.success ||
    result.data.deleted ||
    result.data.protocol !== 1 ||
    result.data.generation !== generation
  )
    throw new Error(
      'Не удалось включить сохранение переписки на сервере. Сообщение не отправлено; обновите сервис ИИ и попробуйте снова.'
    );
  return result.data;
}

/** Повтор использует тот же operationId, чтобы потерянный ответ не очистил уже новую историю. */
export const resetAiConversation = (
  baseUrl: string,
  chatId: string,
  action: 'clear' | 'delete',
  input: AiConversationReset
) => request(`${endpoint(baseUrl, chatId)}/${action}`, input);

/** Удаляет выбранные сообщения через сохранённую операцию, без повторного изменения при потере ответа. */
export async function mutateAiConversation(
  baseUrl: string,
  chatId: string,
  input: AiHistoryMutation
): Promise<AiConversationState> {
  const result = stateSchema.safeParse(
    await requestBody(`${endpoint(baseUrl, chatId)}/messages/mutate`, input)
  );
  if (
    !result.success ||
    result.data.protocol !== 1 ||
    result.data.deleted ||
    result.data.generation !== input.generation + 1
  )
    throw new Error(
      'Не удалось проверить изменение переписки. Обновите чат перед следующим действием.'
    );
  return result.data;
}

/** Отправляет желаемое состояние, а не команду переключения: повтор после потери ответа безопасен. */
export async function setAiConversationMessagePin(
  baseUrl: string,
  chatId: string,
  input: {
    generation: number;
    id: string;
    pinned: boolean;
    expectedVersion: number;
  }
) {
  const body = await requestBody(
    `${endpoint(baseUrl, chatId)}/messages/pin`,
    input
  );
  const result = z
    .object({
      id: z.string(),
      pinned: z.boolean(),
      pinVersion: z.number().int().nonnegative()
    })
    .safeParse(body);
  if (
    !result.success ||
    result.data.id !== input.id ||
    result.data.pinned !== input.pinned ||
    result.data.pinVersion !== input.expectedVersion + 1
  )
    throw new Error(
      'Не удалось проверить сохранение закрепления. Обновите чат перед повтором.'
    );
  return result.data;
}

/** Полная серверная переписка нового формата; старый формат не подменяется пустым ответом. */
export async function fetchAiConversationTranscript(
  baseUrl: string,
  chatId: string,
  generation: number,
  signal?: AbortSignal
) {
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!token) throw new Error('Требуется авторизация.');
  const timeout = AbortSignal.timeout(60_000);
  return loadAiConversationTranscript(async query => {
    const params = new URLSearchParams({
      generation: String(query.generation),
      after: String(query.after ?? 0),
      limit: String(query.limit)
    });
    const response = await fetchWithAiAccess(
      `${endpoint(baseUrl, chatId)}/messages?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout
      }
    );
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(getAiErrorMessage({ status: response.status, body }));
    return body;
  }, generation);
}
