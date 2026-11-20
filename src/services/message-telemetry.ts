import { recordTelemetryEvent } from './useTelemetry';

export const recordMessageTelemetry = (
  event: Omit<Parameters<typeof recordTelemetryEvent>[0], 'category'>
): void => {
  try {
    recordTelemetryEvent({
      ...event,
      category: 'chat',
      payload: { diagnosticVersion: 1, ...event.payload }
    });
  } catch {
    // Диагностика не должна прерывать загрузку истории и подтверждения.
  }
};
