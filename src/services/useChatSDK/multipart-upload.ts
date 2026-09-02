const MIB = 1024 * 1024;
const DEFAULT_THRESHOLD = 32 * MIB;
export const MAX_UPLOAD_FILE_SIZE_MB = 600;
export const MAX_UPLOAD_FILE_SIZE = MAX_UPLOAD_FILE_SIZE_MB * MIB;
export const MAX_UPLOAD_FILE_SIZE_ERROR = `Размер файла превышает лимит ${MAX_UPLOAD_FILE_SIZE_MB}MB`;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_CONTROL_REQUEST_TIMEOUT_MS = 5_000;
const PERSISTED_UPLOADS_KEY = 'sep-chat:multipart-uploads:v1';
const CONFLICT_RETRY_MAX_DELAY_MS = 1_000;
let multipartFileReadTail: Promise<void> = Promise.resolve();

export interface MultipartUploadedPart {
  partNumber: number;
  size: number;
  etag: string;
}

export interface MultipartUploadSession {
  uploadId: string;
  objectName: string;
  chunkSize: number;
  partCount: number;
  size: number;
  contentType: string;
  expiresAt: number;
  status: 'active' | 'completed';
  uploadedParts: MultipartUploadedPart[];
  completed?: MultipartCompleteResult;
}

export interface MultipartCompleteResult {
  objectName: string;
  hash: string;
  etag: string;
}

export interface MultipartUploadTransport {
  init(file: File, signal?: AbortSignal): Promise<MultipartUploadSession>;
  status(
    uploadId: string,
    signal?: AbortSignal
  ): Promise<MultipartUploadSession>;
  uploadPart(
    session: MultipartUploadSession,
    partNumber: number,
    part: Blob,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal
  ): Promise<void>;
  complete(
    uploadId: string,
    signal?: AbortSignal
  ): Promise<MultipartCompleteResult>;
  abort(uploadId: string, signal?: AbortSignal): Promise<void>;
}

export interface MultipartUploadOptions {
  concurrency?: number;
  retryCount?: number;
  persistenceKey?: string;
  signal?: AbortSignal;
  controlRequestTimeoutMs?: number;
  onProgress?: (percent: number) => void;
}

interface PersistedUpload {
  uploadId: string;
  objectName: string;
  expiresAt: number;
  progress?: number;
}

export interface PersistedMultipartUploadReference {
  persistenceKey: string;
  uploadId: string;
}

const parsePositiveNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

export const getMultipartUploadSettings = () => ({
  enabled:
    String(import.meta.env.VITE_MULTIPART_UPLOAD_ENABLED ?? 'true') !== 'false',
  threshold: parsePositiveNumber(
    import.meta.env.VITE_MULTIPART_UPLOAD_THRESHOLD_BYTES,
    DEFAULT_THRESHOLD,
    5 * MIB,
    MAX_UPLOAD_FILE_SIZE
  ),
  concurrency: parsePositiveNumber(
    import.meta.env.VITE_MULTIPART_UPLOAD_CONCURRENCY,
    DEFAULT_CONCURRENCY,
    1,
    4
  ),
  retryCount: parsePositiveNumber(
    import.meta.env.VITE_MULTIPART_UPLOAD_RETRY_COUNT,
    DEFAULT_RETRY_COUNT,
    0,
    8
  )
});

export const shouldUseMultipartUpload = (file: File): boolean => {
  const settings = getMultipartUploadSettings();
  return settings.enabled && file.size >= settings.threshold;
};

export const getMultipartFileFingerprint = (file: File): string =>
  [file.name, file.size, file.lastModified, file.type].join(':');

export const getMultipartUploadPersistenceKey = (
  file: File,
  scope?: string
): string => {
  const fingerprint = getMultipartFileFingerprint(file);
  return scope ? `${scope}:${fingerprint}` : fingerprint;
};

export const getUploadFileSizeError = (
  file: Pick<File, 'size'>
): string | null =>
  file.size > MAX_UPLOAD_FILE_SIZE ? MAX_UPLOAD_FILE_SIZE_ERROR : null;

const readPersistedUploads = (): Record<string, PersistedUpload> => {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const parsed = JSON.parse(
      localStorage.getItem(PERSISTED_UPLOADS_KEY) || '{}'
    ) as Record<string, PersistedUpload>;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value.expiresAt > now)
    );
  } catch {
    return {};
  }
};

const writePersistedUploads = (
  uploads: Record<string, PersistedUpload>
): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(PERSISTED_UPLOADS_KEY, JSON.stringify(uploads));
  } catch {
    // Resume remains available through the active in-memory request.
  }
};

const persistUpload = (
  file: File,
  session: MultipartUploadSession,
  scope?: string
): void => {
  const uploads = readPersistedUploads();
  uploads[getMultipartUploadPersistenceKey(file, scope)] = {
    uploadId: session.uploadId,
    objectName: session.objectName,
    expiresAt: session.expiresAt
  };
  writePersistedUploads(uploads);
};

const normalizePersistedProgress = (value: unknown): number => {
  const progress = Number(value);

  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.floor(progress)));
};

const persistUploadProgress = (
  file: File,
  uploadId: string,
  progress: number,
  scope?: string
): void => {
  const uploads = readPersistedUploads();
  const key = getMultipartUploadPersistenceKey(file, scope);
  const persisted = uploads[key];

  if (!persisted || persisted.uploadId !== uploadId) {
    return;
  }

  const normalizedProgress = normalizePersistedProgress(progress);

  if (normalizedProgress <= normalizePersistedProgress(persisted.progress)) {
    return;
  }

  persisted.progress = normalizedProgress;
  writePersistedUploads(uploads);
};

export const removePersistedMultipartUpload = (
  file: File,
  scope?: string
): void => {
  const uploads = readPersistedUploads();
  delete uploads[getMultipartUploadPersistenceKey(file, scope)];
  writePersistedUploads(uploads);
};

export const getPersistedMultipartUploadsForScope = (
  scopePrefix: string
): PersistedMultipartUploadReference[] => {
  const normalizedPrefix = scopePrefix.endsWith(':')
    ? scopePrefix
    : `${scopePrefix}:`;

  return Object.entries(readPersistedUploads())
    .filter(([key]) => key.startsWith(normalizedPrefix))
    .map(([persistenceKey, upload]) => ({
      persistenceKey,
      uploadId: upload.uploadId
    }));
};

export const removePersistedMultipartUploadByKey = (
  persistenceKey: string
): void => {
  const uploads = readPersistedUploads();
  delete uploads[persistenceKey];
  writePersistedUploads(uploads);
};

const getPersistedUpload = (
  file: File,
  scope?: string
): PersistedUpload | undefined =>
  readPersistedUploads()[getMultipartUploadPersistenceKey(file, scope)];

const createAbortError = (): Error => {
  const error = new Error('Multipart upload aborted');
  error.name = 'AbortError';
  return error;
};

const readBlobIntoMemory = (
  blob: Blob,
  signal?: AbortSignal
): Promise<ArrayBuffer> => {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }

  if (typeof FileReader === 'undefined') {
    return blob.arrayBuffer().then(buffer => {
      if (signal?.aborted) {
        throw createAbortError();
      }

      return buffer;
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const cleanup = (): void => {
      signal?.removeEventListener('abort', abort);
      reader.onload = null;
      reader.onerror = null;
      reader.onabort = null;
      reader.onprogress = null;
    };
    const abort = (): void => reader.abort();

    reader.onload = () => {
      const result = reader.result;
      cleanup();

      if (!(result instanceof ArrayBuffer)) {
        reject(new Error('Failed to read multipart file part'));
        return;
      }

      resolve(result);
    };
    reader.onerror = () => {
      const error = reader.error || new Error('Failed to read file part');
      cleanup();
      reject(error);
    };
    reader.onabort = () => {
      cleanup();
      reject(createAbortError());
    };
    signal?.addEventListener('abort', abort, { once: true });
    reader.readAsArrayBuffer(blob);
  });
};

const readMultipartPartIntoMemory = <T>(
  operation: () => Promise<T>
): Promise<T> => {
  const result = multipartFileReadTail.then(operation);
  multipartFileReadTail = result.then(
    () => undefined,
    () => undefined
  );
  return result;
};

const createControlRequestTimeoutError = (): Error & { status: number } =>
  Object.assign(new Error('Multipart control request timed out'), {
    name: 'TimeoutError',
    status: 408
  });

const runControlRequest = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<T> => {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const controller = new AbortController();
  let rejectGuard: ((reason: Error) => void) | undefined;
  const guard = new Promise<never>((_resolve, reject) => {
    rejectGuard = reject;
  });
  const onAbort = (): void => {
    rejectGuard?.(createAbortError());
    controller.abort();
  };

  signal?.addEventListener('abort', onAbort, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    rejectGuard?.(createControlRequestTimeoutError());
    controller.abort();
  }, timeoutMs);

  try {
    return await Promise.race([operation(controller.signal), guard]);
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
    rejectGuard = undefined;
  }
};

const wait = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const onAbort = (): void => {
      window.clearTimeout(timeout);
      reject(createAbortError());
    };
    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

const getHttpStatus = (error: unknown): number | undefined => {
  const status = Number((error as { status?: unknown })?.status);
  return Number.isSafeInteger(status) ? status : undefined;
};

const getConflictRetryDelay = (attempt: number): number =>
  Math.min(CONFLICT_RETRY_MAX_DELAY_MS, 300 * 2 ** Math.min(attempt, 5));

const isTransientUploadError = (error: unknown): boolean => {
  if ((error as { name?: unknown })?.name === 'AbortError') {
    return false;
  }

  const status = getHttpStatus(error);
  return (
    status === undefined ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
};

const getSession = async (
  file: File,
  transport: MultipartUploadTransport,
  persistenceKey: string | undefined,
  signal: AbortSignal | undefined,
  requestTimeoutMs: number
): Promise<MultipartUploadSession> => {
  const persisted = getPersistedUpload(file, persistenceKey);

  if (persisted) {
    try {
      const session = await runControlRequest(
        requestSignal => transport.status(persisted.uploadId, requestSignal),
        signal,
        requestTimeoutMs
      );

      if (
        session.objectName === persisted.objectName &&
        session.size === file.size
      ) {
        return session;
      }
    } catch (error) {
      const status = getHttpStatus(error);

      if (status === 404 || status === 410) {
        removePersistedMultipartUpload(file, persistenceKey);
      } else {
        throw error;
      }
    }
  }

  const session = await runControlRequest(
    requestSignal => transport.init(file, requestSignal),
    signal,
    requestTimeoutMs
  );
  persistUpload(file, session, persistenceKey);
  return session;
};

const getSessionWithRetry = async (
  file: File,
  transport: MultipartUploadTransport,
  persistenceKey?: string,
  signal?: AbortSignal,
  requestTimeoutMs = DEFAULT_CONTROL_REQUEST_TIMEOUT_MS
): Promise<MultipartUploadSession> => {
  let attempt = 0;

  for (;;) {
    try {
      return await getSession(
        file,
        transport,
        persistenceKey,
        signal,
        requestTimeoutMs
      );
    } catch (error) {
      if (!isTransientUploadError(error)) {
        throw error;
      }

      await wait(getConflictRetryDelay(attempt), signal);
      attempt += 1;
    }
  }
};

export const uploadMultipartFile = async (
  file: File,
  transport: MultipartUploadTransport,
  options: MultipartUploadOptions = {}
): Promise<{
  session: MultipartUploadSession;
  completed: MultipartCompleteResult;
}> => {
  const settings = getMultipartUploadSettings();
  const fileSizeError = getUploadFileSizeError(file);

  if (fileSizeError) {
    throw new Error(fileSizeError);
  }

  const concurrency = parsePositiveNumber(
    options.concurrency,
    settings.concurrency,
    1,
    4
  );
  const retryCount = parsePositiveNumber(
    options.retryCount,
    settings.retryCount,
    0,
    8
  );
  const controlRequestTimeoutMs = parsePositiveNumber(
    options.controlRequestTimeoutMs,
    DEFAULT_CONTROL_REQUEST_TIMEOUT_MS,
    100,
    30_000
  );
  const session = await getSessionWithRetry(
    file,
    transport,
    options.persistenceKey,
    options.signal,
    controlRequestTimeoutMs
  );

  if (session.status === 'completed' && session.completed) {
    options.onProgress?.(100);
    return { session, completed: session.completed };
  }

  const completedParts = new Set(
    session.uploadedParts.map(part => part.partNumber)
  );
  const completedBytes = new Map<number, number>(
    session.uploadedParts.map(part => [part.partNumber, part.size])
  );
  const activeBytes = new Map<number, number>();
  const queue = Array.from(
    { length: session.partCount },
    (_, index) => index + 1
  ).filter(partNumber => !completedParts.has(partNumber));
  let completedByOtherRequest: MultipartCompleteResult | undefined;
  const persisted = getPersistedUpload(file, options.persistenceKey);
  let persistedProgress =
    persisted?.uploadId === session.uploadId
      ? normalizePersistedProgress(persisted.progress)
      : 0;
  let lastProgress = 0;
  let lastEmittedProgress = -1;

  const reportProgress = (): void => {
    const confirmedLoaded = [...completedBytes.values()].reduce(
      (sum, value) => sum + value,
      0
    );
    const loaded =
      confirmedLoaded +
      [...activeBytes.values()].reduce((sum, value) => sum + value, 0);
    const percent = Math.min(100, Math.floor((loaded / file.size) * 100));
    lastProgress = Math.max(lastProgress, percent);

    if (lastProgress > persistedProgress) {
      persistUploadProgress(
        file,
        session.uploadId,
        lastProgress,
        options.persistenceKey
      );
      persistedProgress = lastProgress;
    }

    if (lastProgress <= lastEmittedProgress) {
      return;
    }

    lastEmittedProgress = lastProgress;
    options.onProgress?.(lastProgress);
  };

  const mergeUploadedParts = (status: MultipartUploadSession): void => {
    for (const uploaded of status.uploadedParts) {
      if (uploaded.partNumber < 1 || uploaded.partNumber > session.partCount) {
        continue;
      }

      activeBytes.delete(uploaded.partNumber);
      completedBytes.set(uploaded.partNumber, uploaded.size);
      completedParts.add(uploaded.partNumber);
    }

    reportProgress();
  };

  const getCurrentStatus = (): Promise<MultipartUploadSession> =>
    runControlRequest(
      requestSignal => transport.status(session.uploadId, requestSignal),
      options.signal,
      controlRequestTimeoutMs
    );

  reportProgress();

  const uploadPartWithRetry = async (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * session.chunkSize;
    const end = Math.min(file.size, start + session.chunkSize);
    const filePart = file.slice(
      start,
      end,
      file.type || 'application/octet-stream'
    );
    // Read one chunk at a time across all active uploads, then let the bounded
    // multipart XHR workers send those memory-backed chunks in parallel. Disk
    // reads intentionally do not affect upload progress: only XHR bytes do.
    const partBuffer = await readMultipartPartIntoMemory(() =>
      readBlobIntoMemory(filePart, options.signal)
    );
    const part = new Blob([partBuffer], {
      type: filePart.type || 'application/octet-stream'
    });

    if (options.signal?.aborted) {
      throw createAbortError();
    }

    let failureAttempt = 0;
    let conflictAttempt = 0;

    for (;;) {
      if (completedParts.has(partNumber)) {
        return;
      }

      if (options.signal?.aborted) {
        throw createAbortError();
      }

      try {
        await transport.uploadPart(
          session,
          partNumber,
          part,
          loaded => {
            activeBytes.set(
              partNumber,
              Math.max(
                activeBytes.get(partNumber) || 0,
                Math.min(part.size, loaded)
              )
            );
            reportProgress();
          },
          options.signal
        );
        activeBytes.delete(partNumber);
        completedBytes.set(partNumber, part.size);
        completedParts.add(partNumber);
        reportProgress();
        return;
      } catch (error) {
        activeBytes.delete(partNumber);

        if (
          options.signal?.aborted ||
          (error as Error)?.name === 'AbortError'
        ) {
          throw createAbortError();
        }

        let status: MultipartUploadSession;

        try {
          status = await getCurrentStatus();
        } catch (statusError) {
          if (!isTransientUploadError(statusError)) {
            throw statusError;
          }

          await wait(getConflictRetryDelay(failureAttempt), options.signal);
          failureAttempt += 1;
          continue;
        }

        if (status.status === 'completed' && status.completed) {
          completedByOtherRequest = status.completed;
          return;
        }

        mergeUploadedParts(status);

        if (completedParts.has(partNumber)) {
          return;
        }

        if (getHttpStatus(error) === 409) {
          await wait(getConflictRetryDelay(conflictAttempt), options.signal);
          conflictAttempt += 1;
          continue;
        }

        if (isTransientUploadError(error)) {
          await wait(getConflictRetryDelay(failureAttempt), options.signal);
          failureAttempt += 1;
          continue;
        }

        if (failureAttempt === retryCount) {
          throw error;
        }

        await wait(300 * 2 ** failureAttempt, options.signal);
        failureAttempt += 1;
      }
    }
  };

  const completeWithConflictRetry =
    async (): Promise<MultipartCompleteResult> => {
      let conflictAttempt = 0;

      for (;;) {
        if (options.signal?.aborted) {
          throw createAbortError();
        }

        try {
          return await runControlRequest(
            requestSignal =>
              transport.complete(session.uploadId, requestSignal),
            options.signal,
            controlRequestTimeoutMs
          );
        } catch (error) {
          if (getHttpStatus(error) !== 409) {
            if (isTransientUploadError(error)) {
              await wait(
                getConflictRetryDelay(conflictAttempt),
                options.signal
              );
              conflictAttempt += 1;
              continue;
            }

            throw error;
          }

          let status: MultipartUploadSession;

          try {
            status = await getCurrentStatus();
          } catch (statusError) {
            if (!isTransientUploadError(statusError)) {
              throw statusError;
            }

            await wait(getConflictRetryDelay(conflictAttempt), options.signal);
            conflictAttempt += 1;
            continue;
          }

          if (status.status === 'completed' && status.completed) {
            return status.completed;
          }

          mergeUploadedParts(status);

          await wait(getConflictRetryDelay(conflictAttempt), options.signal);
          conflictAttempt += 1;
        }
      }
    };

  try {
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length > 0 && !completedByOtherRequest) {
          const partNumber = queue.shift();

          if (partNumber !== undefined) {
            await uploadPartWithRetry(partNumber);
          }
        }
      }
    );
    await Promise.all(workers);
    const completed =
      completedByOtherRequest || (await completeWithConflictRetry());
    if (lastEmittedProgress < 100) {
      options.onProgress?.(100);
    }
    return { session, completed };
  } catch (error) {
    if (options.signal?.aborted || (error as Error)?.name === 'AbortError') {
      await runControlRequest(
        requestSignal => transport.abort(session.uploadId, requestSignal),
        undefined,
        controlRequestTimeoutMs
      ).catch(() => undefined);
      removePersistedMultipartUpload(file, options.persistenceKey);
    }

    throw error;
  }
};
