import { z } from 'zod';
import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getAiErrorMessage } from './aiErrorMessages';
import { aiActionTaskSchema, type AiActionTask } from './aiActionTaskContract';
export { aiActionTaskSchema, type AiActionTask } from './aiActionTaskContract';
export { actionTaskSummary } from './aiActionTaskPresentation';

export type AiActionDecision = 'approve' | 'resume' | 'verify' | 'cancel';

const endpoint = (base: string, thread: string) =>
  `${base.replace(/\/+$/, '').replace(/\/api$/, '')}/action-tasks/${encodeURIComponent(thread)}`;
export async function fetchAiActionTasks(
  baseUrl: string,
  threadId: string
): Promise<AiActionTask[] | null> {
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!token || !baseUrl) return null;
  const response = await fetch(endpoint(baseUrl, threadId), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return null; // Поэтапное обновление сервера и клиента.
  if (!response.ok)
    throw new Error(
      getAiErrorMessage({
        status: response.status,
        body: await response.json().catch(() => null)
      })
    );
  return z
    .object({ tasks: z.array(aiActionTaskSchema) })
    .parse(await response.json()).tasks;
}
export async function controlAiActionTask(
  baseUrl: string,
  threadId: string,
  task: AiActionTask,
  action: AiActionDecision
): Promise<AiActionTask> {
  const token = getAuthToken() || getStoredChatAccessToken();
  if (!token) throw new Error('Для продолжения поручения войдите в систему.');
  const response = await fetch(
    `${endpoint(baseUrl, threadId)}/${encodeURIComponent(task.id)}/${action}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ revision: task.revision, digest: task.digest })
    }
  );
  if (!response.ok)
    throw new Error(
      getAiErrorMessage({
        status: response.status,
        body: await response.json().catch(() => null)
      })
    );
  return z.object({ task: aiActionTaskSchema }).parse(await response.json())
    .task;
}

/** Принимает план только из специального серверного события или результата инструмента планирования. */
export function actionTaskFromEvent(event: any): AiActionTask | null {
  let candidate: unknown;
  if (event.type === 'data-action-task')
    candidate =
      event.data?.task ?? event.payload?.data?.task ?? event.payload?.task;
  if (
    ['tool-result', 'tool-output'].includes(event.type) &&
    event.payload?.toolName === 'ai_action_plan'
  )
    candidate = event.payload?.result?.task ?? event.payload?.output?.task;
  const parsed = aiActionTaskSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
