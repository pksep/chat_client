import type { IMessage, ITopic } from '../components/interfaces/interfaces';
import { getTopicStateDiagnostic } from '../utils/topic-state-diagnostics';
import { recordTelemetryEvent } from './useTelemetry';

const lastEvents = new Map<string, { signature: string; at: number }>();

export const recordTopicStateTelemetry = (
  source: string,
  topic: ITopic | null | undefined,
  clientMessage: IMessage | null | undefined,
  userId?: string | null,
  details: Record<string, unknown> = {},
  warning = false
): void => {
  if (!topic?.id) return;
  const payload = {
    source,
    ...getTopicStateDiagnostic(topic, clientMessage, userId),
    ...details
  };
  const signature = JSON.stringify(payload);
  const key = `${topic.id}:${source}`;
  const previous = lastEvents.get(key);
  if (previous?.signature === signature && Date.now() - previous.at < 30_000)
    return;
  lastEvents.delete(key);
  lastEvents.set(key, { signature, at: Date.now() });
  if (lastEvents.size > 500) lastEvents.delete(lastEvents.keys().next().value!);
  recordTelemetryEvent({
    category: 'chat',
    name: warning ? 'chat.topic_state.mismatch' : 'chat.topic_state.changed',
    level: warning ? 'warn' : 'info',
    entityType: 'topic',
    entityId: topic.id,
    payload
  });
};
