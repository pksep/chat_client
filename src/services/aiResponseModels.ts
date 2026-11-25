import { z } from 'zod';
import { fetchWithAiAccess } from '../composables/useChatAccess';
import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getConfig } from './useConfig';

export interface ResponseModelSelection {
  id: string;
  effort?: string;
}

const catalogSchema = z.object({
  models: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    efforts: z.array(z.string()),
    defaultEffort: z.string().optional()
  })).min(1),
  defaults: z.object({ quick: z.string(), advanced: z.string() })
});

export type ResponseCatalog = z.infer<typeof catalogSchema>;

export async function fetchAiResponseCatalog(signal: AbortSignal): Promise<ResponseCatalog> {
  const base = getConfig().CHAT_MASTRA_URL?.replace(/\/+$/, '');
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!base || !token) throw new Error('Не удалось подключиться к ИИ.');

  const server = base.replace(/\/api$/, '');
  const response = await fetchWithAiAccess(server + '/response-models', {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)])
  });
  if (!response.ok) throw new Error('Не удалось загрузить список моделей.');

  return catalogSchema.parse(await response.json());
}
