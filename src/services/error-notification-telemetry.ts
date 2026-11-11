import { createTelemetryTraceId, recordTelemetryEvent } from './useTelemetry';

interface ErrorRequestDetails {
  source: string;
  url: string;
  method: string;
  elapsedMs: number;
  timeoutMs?: number;
  httpStatus?: number;
  phase: 'request' | 'response_body' | 'http_status';
}

export interface NotificationDiagnostics {
  source?: string;
  error?: unknown;
}

const errorRequests = new WeakMap<
  object,
  { traceId: string; payload: Record<string, unknown> }
>();

const sanitizeText = (text: string): string =>
  text
    .replace(/https?:\/\/[^\s<>"')]+/gi, value => {
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}`;
      } catch {
        return '[url]';
      }
    })
    .replace(/(\/[^\s<>"'?]*)[?#][^\s<>"')]*/g, '$1')
    .replace(/\bBearer\s+[^\s,"';]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted]')
    .replace(
      /(["']?(?:authorization|cookie|password|token|access[_-]?token|refresh[_-]?token|api[_-]?key|signature)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      '$1[redacted]'
    )
    .slice(0, 700);

const stackFrames = (stack: unknown): string[] | undefined =>
  typeof stack === 'string'
    ? stack.split('\n').slice(1, 9).map(sanitizeText)
    : undefined;

const errorDetails = (error: unknown): Record<string, unknown> => {
  if (!error || typeof error !== 'object') {
    return {
      errorMessage: typeof error === 'string' ? sanitizeText(error) : undefined
    };
  }

  const record = error as Record<string, unknown>;
  return {
    errorName:
      typeof record.name === 'string' ? sanitizeText(record.name) : undefined,
    errorMessage:
      typeof record.message === 'string'
        ? sanitizeText(record.message)
        : undefined,
    errorStack: stackFrames(record.stack),
    errorCode:
      typeof record.code === 'number'
        ? record.code
        : typeof record.code === 'string'
          ? sanitizeText(record.code)
          : undefined,
    httpStatus: typeof record.status === 'number' ? record.status : undefined
  };
};

export const recordErrorRequest = (
  error: unknown,
  details: ErrorRequestDetails
): void => {
  try {
    const url = new URL(details.url, 'https://telemetry.invalid');
    const traceId = createTelemetryTraceId('request-error');
    const payload = {
      ...errorDetails(error),
      source: details.source,
      requestPath: url.pathname,
      method: details.method,
      elapsedMs: details.elapsedMs,
      timeoutMs: details.timeoutMs,
      httpStatus: details.httpStatus,
      phase: details.phase
    };
    if (error && typeof error === 'object') {
      errorRequests.set(error, { traceId, payload });
    }
    recordTelemetryEvent({
      category: 'network',
      name: 'network.request.failed',
      level: 'error',
      traceId,
      entityType: 'http_request',
      payload
    });
  } catch {
    // Сбой диагностики не должен менять результат запроса.
  }
};

export const recordErrorNotification = (options: {
  title: string;
  description: unknown;
  error: unknown;
  source?: string;
  stack?: string;
}): void => {
  try {
    const request =
      options.error && typeof options.error === 'object'
        ? errorRequests.get(options.error)
        : undefined;
    recordTelemetryEvent({
      category: 'notification',
      name: 'notification.error.shown',
      level: 'error',
      traceId: request?.traceId,
      entityType: 'error_notification',
      payload: {
        ...errorDetails(options.error),
        ...request?.payload,
        title: sanitizeText(options.title),
        description:
          typeof options.description === 'string'
            ? sanitizeText(options.description)
            : undefined,
        source: options.source || request?.payload.source,
        notificationStack: stackFrames(options.stack)
      }
    });
  } catch {
    // Плашка должна показываться и при недоступной телеметрии.
  }
};
