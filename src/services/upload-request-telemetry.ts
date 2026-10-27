import { recordTelemetryEvent } from './useTelemetry';

const UPLOAD_IDLE_DIAGNOSTIC_MS = 30_000;
const activeUploads = new Set<(reason: string) => void>();

export const recordActiveUploadSnapshots = (reason: string): void => {
  activeUploads.forEach(snapshot => snapshot(reason));
};

// Только наблюдение: отсутствие событий прогресса не доказывает потерю сети.
export const observeUploadRequest = (
  xhr: XMLHttpRequest,
  options: {
    traceId: string;
    entityId?: string;
    totalBytes: number;
    uploadHost: string;
    payload: Record<string, unknown>;
    getConnectionState: () => Record<string, unknown>;
  }
) => {
  const startedAt = Date.now();
  let lastProgressAt = startedAt;
  let lastActivityAt = startedAt;
  let loadedBytes = 0;
  let phase: 'sending_body' | 'waiting_response' = 'sending_body';
  let checkpoint = 0;
  let stalled = false;
  let finished = false;
  let idleTimer: ReturnType<typeof setTimeout>;
  const connection = (navigator as Navigator & { connection?: EventTarget })
    .connection;

  const record = (
    stage: string,
    details: Record<string, unknown> = {},
    level: 'info' | 'warn' = 'info'
  ): void => {
    try {
      recordTelemetryEvent({
        category: 'upload',
        name: `upload.storage_put.${stage}`,
        level,
        traceId: options.traceId,
        entityType: 'upload',
        entityId: options.entityId,
        payload: {
          ...options.payload,
          uploadHost: options.uploadHost,
          phase,
          // loadedBytes сообщает браузер; это не подтверждение приёма сервером.
          loadedBytes,
          totalBytes: options.totalBytes,
          elapsedMs: Date.now() - startedAt,
          noProgressMs: Date.now() - lastProgressAt,
          idleMs: Date.now() - lastActivityAt,
          readyState: xhr.readyState,
          httpStatus: xhr.status || null,
          xhrTimeoutMs: xhr.timeout,
          connectionState: options.getConnectionState(),
          ...details
        }
      });
    } catch {
      // Диагностика не должна влиять на исход загрузки.
    }
  };

  const checkIdle = (): void => {
    clearTimeout(idleTimer);
    if (finished || document.hidden || stalled) return;
    const remaining = UPLOAD_IDLE_DIAGNOSTIC_MS - (Date.now() - lastActivityAt);
    if (remaining > 0) {
      idleTimer = setTimeout(checkIdle, remaining);
    } else {
      stalled = true;
      record('stalled', { reason: 'no_observed_activity' }, 'warn');
    }
  };
  const activity = (): void => {
    lastActivityAt = Date.now();
    if (stalled) {
      stalled = false;
      record('resumed');
    }
    checkIdle();
  };
  const progress = (event: ProgressEvent): void => {
    if (event.loaded <= loadedBytes) return;
    loadedBytes = event.loaded;
    lastProgressAt = Date.now();
    activity();
    const nextCheckpoint = Math.min(
      4,
      Math.floor((loadedBytes / Math.max(1, options.totalBytes)) * 4)
    );
    if (nextCheckpoint > checkpoint) {
      checkpoint = nextCheckpoint;
      record('progress');
    }
  };
  const bodySent = (): void => {
    phase = 'waiting_response';
    activity();
    record('body_sent');
  };
  const headersReceived = (): void => {
    if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED) activity();
  };
  const snapshot = (reason: string): void => {
    if (finished) return;
    record('snapshot', { reason });
    checkIdle();
  };
  const visibility = () => snapshot('visibility-change');
  const online = () => snapshot('browser-online');
  const offline = () => snapshot('browser-offline');
  const networkChange = () => snapshot('browser-network-change');
  const pageHide = () => snapshot('page-hide');

  const cleanup = (): void => {
    clearTimeout(idleTimer);
    activeUploads.delete(snapshot);
    xhr.upload.removeEventListener('progress', progress);
    xhr.upload.removeEventListener('load', bodySent);
    xhr.removeEventListener('readystatechange', headersReceived);
    xhr.removeEventListener('load', loaded);
    xhr.removeEventListener('error', failed);
    xhr.removeEventListener('abort', aborted);
    xhr.removeEventListener('timeout', timedOut);
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
    window.removeEventListener('pagehide', pageHide);
    connection?.removeEventListener('change', networkChange);
  };
  const finish = (outcome: string): void => {
    if (finished) return;
    finished = true;
    record('finished', { outcome }, outcome === 'success' ? 'info' : 'warn');
    cleanup();
  };
  const loaded = () =>
    finish(xhr.status >= 200 && xhr.status < 300 ? 'success' : 'http_error');
  const failed = () => finish('network_error');
  const aborted = () => finish('aborted');
  const timedOut = () => finish('timeout');

  activeUploads.add(snapshot);
  xhr.upload.addEventListener('progress', progress);
  xhr.upload.addEventListener('load', bodySent);
  xhr.addEventListener('readystatechange', headersReceived);
  xhr.addEventListener('load', loaded);
  xhr.addEventListener('error', failed);
  xhr.addEventListener('abort', aborted);
  xhr.addEventListener('timeout', timedOut);
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  window.addEventListener('pagehide', pageHide);
  connection?.addEventListener('change', networkChange);
  snapshot('request-start');
  return { sendFailed: () => finish('send_exception') };
};
