import { fetchWithAiAccess } from '../composables/useChatAccess';
import { z } from 'zod';
import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getConfig } from './useConfig';

const automationRunResultSchema = z.object({
  runId: z.string().optional(),
  completedAt: z.number().int().positive(),
  outcome: z.enum(['success', 'failed', 'aborted']),
  text: z.string()
});

const automationSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  task: z.string().min(1),
  schedule: z.string().min(1),
  timezone: z.string().min(1),
  status: z.enum(['active', 'paused']),
  nextRunAt: z.number().nullable(),
  lastRunAt: z.number().nullable(),
  lastResult: automationRunResultSchema.optional(),
  sessionId: z.string().min(1)
});

const automationListSchema = z.object({
  automations: z.array(automationSummarySchema)
});

export type AiAutomationSummary = z.infer<typeof automationSummarySchema>;

/** Загружает только расписания авторизованного пользователя из chat_ai. */
export const fetchAiAutomations = async (): Promise<
  AiAutomationSummary[] | null
> => {
  const token = getAuthToken() || getStoredChatAccessToken();
  const baseUrl = getConfig().CHAT_MASTRA_URL?.replace(/\/+$/, '');
  // До завершения авторизации сохраняем показанный список, а не принимаем
  // отсутствие токена за отсутствие серверных расписаний.
  if (!token || !baseUrl) return null;

  // Пользовательские Mastra routes регистрируются у корня сервера, без /api.
  const serverBaseUrl = baseUrl.endsWith('/api')
    ? baseUrl.slice(0, -4)
    : baseUrl;
  const response = await fetchWithAiAccess(`${serverBaseUrl}/automations`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    throw new Error('Не удалось загрузить автоматизированные задачи');
  }

  return automationListSchema.parse(await response.json()).automations;
};
