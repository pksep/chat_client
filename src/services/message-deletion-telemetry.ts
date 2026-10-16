import { recordTelemetryEvent } from './useTelemetry';

type DeletionStage =
  | 'requested'
  | 'confirmed'
  | 'failed'
  | 'slow'
  | 'applied'
  | 'stale_filtered'
  | 'cache_failed';

const recentEvents = new Map<string, number>();

export const recordMessageDeletionTelemetry = (
  stage: DeletionStage,
  topicId: string,
  messageId: string,
  details: Record<string, unknown> = {},
  traceId?: string
): void => {
  if (!topicId || !messageId) return;
  if (!traceId) {
    const key = JSON.stringify([stage, topicId, messageId, details.source]);
    const previous = recentEvents.get(key);
    if (previous !== undefined && Date.now() - previous < 30_000) return;
    recentEvents.delete(key);
    recentEvents.set(key, Date.now());
    if (recentEvents.size > 500)
      recentEvents.delete(recentEvents.keys().next().value!);
  }
  recordTelemetryEvent({
    category: 'chat',
    name: `chat.message_delete.${stage}`,
    level:
      stage === 'failed' || stage === 'cache_failed'
        ? 'error'
        : stage === 'slow' || stage === 'stale_filtered'
          ? 'warn'
          : 'info',
    traceId,
    entityType: 'message',
    entityId: messageId,
    payload: { topicId, messageId, ...details }
  });
};
