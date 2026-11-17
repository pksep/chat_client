import { z } from 'zod';
import { fetchWithAiAccess } from '../composables/useChatAccess';
import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getConfig } from './useConfig';
import {
  aiConversationPageSchema,
  type AiConversationPage
} from './aiConversationTranscript';

import {
  aiConversationSourceSchema,
  type AiConversationSource
} from './aiConversationSource';
export {
  aiConversationSourceSchema,
  type AiConversationSource
} from './aiConversationSource';

const infoSchema = aiConversationSourceSchema.extend({
  title: z.string().nullable(),
  generation: z.number().int().nonnegative(),
  deleted: z.literal(false),
  muted: z.boolean()
});

export type AiConversationInfo = z.infer<typeof infoSchema>;

function parseInfo(value: unknown): AiConversationInfo {
  const result = infoSchema.safeParse(value);
  if (!result.success) throw new AiConversationInfoError(503);

  return result.data;
}

export class AiConversationInfoError extends Error {
  constructor(readonly status: number) {
    super(
      status === 404
        ? 'Это личный ИИ-диалог. Его история доступна только владельцу.'
        : 'Не удалось загрузить информацию о чате. Повторите позже.'
    );
  }
}

const request = async (
  threadId: string,
  suffix: string,
  input?: unknown
): Promise<unknown> => {
  const base = getConfig()
    .CHAT_MASTRA_URL?.replace(/\/+$/, '')
    .replace(/\/api$/, '');
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!base || !token) throw new Error('Подключение к ИИ недоступно.');
  const response = await fetchWithAiAccess(
    `${base}/conversations/${encodeURIComponent(threadId)}/${suffix}`,
    {
      method: input === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(input === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000)
    }
  );
  if (!response.ok) throw new AiConversationInfoError(response.status);

  return response.json();
};

export async function fetchAiConversationInfo(
  threadId: string,
  expected?: AiConversationSource
): Promise<AiConversationInfo> {
  const params = expected
    ? `?${new URLSearchParams({ ownerId: expected.ownerId, organizationId: expected.organizationId })}`
    : '';

  return parseInfo(await request(threadId, `info${params}`));
}

export async function updateAiConversationInfo(
  threadId: string,
  patch: { generation: number; title?: string; muted?: boolean }
): Promise<AiConversationInfo> {
  return parseInfo(await request(threadId, 'info', patch));
}

export async function fetchAiConversationMediaPage(
  info: AiConversationInfo,
  after = 0
): Promise<AiConversationPage> {
  const params = new URLSearchParams({
    generation: String(info.generation),
    after: String(after),
    limit: '30'
  });
  const page = aiConversationPageSchema.parse(
    await request(info.threadId, `messages?${params}`)
  );
  if (page.generation !== info.generation || page.incompleteMessages.length)
    throw new Error(
      'Не удалось полностью загрузить вложения. Обновите информацию о чате.'
    );

  return page;
}
