const MIB = 1024 * 1024;
const DEFAULT_THRESHOLD = 32 * MIB;
export const MAX_UPLOAD_FILE_SIZE_MB = 600;
export const MAX_UPLOAD_FILE_SIZE = MAX_UPLOAD_FILE_SIZE_MB * MIB;
export const MAX_UPLOAD_FILE_SIZE_ERROR = `Размер файла превышает лимит ${MAX_UPLOAD_FILE_SIZE_MB}MB`;
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_COUNT = 3;
const PERSISTED_UPLOADS_KEY = 'sep-chat:multipart-uploads:v1';

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
  init(file: File): Promise<MultipartUploadSession>;
  status(uploadId: string): Promise<MultipartUploadSession>;
  uploadPart(
    session: MultipartUploadSession,
    partNumber: number,
    part: Blob,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal
  ): Promise<void>;
  complete(uploadId: string): Promise<MultipartCompleteResult>;
  abort(uploadId: string): Promise<void>;
}

export interface MultipartUploadOptions {
  concurrency?: number;
  retryCount?: number;
  persistenceKey?: string;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

interface PersistedUpload {
  uploadId: string;
  objectName: string;
  expiresAt: number;
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

export const removePersistedMultipartUpload = (
  file: File,
  scope?: string
): void => {
  const uploads = readPersistedUploads();
  delete uploads[getMultipartUploadPersistenceKey(file, scope)];
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

const wait = (delayMs: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const timeout = window.setTimeout(resolve, delayMs);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout);
        reject(createAbortError());
      },
      { once: true }
    );
  });

const getSession = async (
  file: File,
  transport: MultipartUploadTransport,
  persistenceKey?: string
): Promise<MultipartUploadSession> => {
  const persisted = getPersistedUpload(file, persistenceKey);

  if (persisted) {
    try {
      const session = await transport.status(persisted.uploadId);

      if (
        session.objectName === persisted.objectName &&
        session.size === file.size
      ) {
        return session;
      }
    } catch {
      removePersistedMultipartUpload(file, persistenceKey);
    }
  }

  const session = await transport.init(file);
  persistUpload(file, session, persistenceKey);
  return session;
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
  const session = await getSession(file, transport, options.persistenceKey);

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
  let lastProgress = 0;

  const reportProgress = (): void => {
    const loaded =
      [...completedBytes.values()].reduce((sum, value) => sum + value, 0) +
      [...activeBytes.values()].reduce((sum, value) => sum + value, 0);
    const percent = Math.min(100, Math.floor((loaded / file.size) * 100));
    lastProgress = Math.max(lastProgress, percent);
    options.onProgress?.(lastProgress);
  };

  reportProgress();

  const uploadPartWithRetry = async (partNumber: number): Promise<void> => {
    const start = (partNumber - 1) * session.chunkSize;
    const end = Math.min(file.size, start + session.chunkSize);
    const part = file.slice(
      start,
      end,
      file.type || 'application/octet-stream'
    );

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      if (options.signal?.aborted) {
        throw createAbortError();
      }

      try {
        await transport.uploadPart(
          session,
          partNumber,
          part,
          loaded => {
            activeBytes.set(partNumber, Math.min(part.size, loaded));
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

        const status = await transport.status(session.uploadId);
        const uploaded = status.uploadedParts.find(
          item => item.partNumber === partNumber
        );

        if (uploaded) {
          completedBytes.set(partNumber, uploaded.size);
          completedParts.add(partNumber);
          reportProgress();
          return;
        }

        if (attempt === retryCount) {
          throw error;
        }

        await wait(300 * 2 ** attempt, options.signal);
      }
    }
  };

  try {
    const workers = Array.from(
      { length: Math.min(concurrency, queue.length) },
      async () => {
        while (queue.length > 0) {
          const partNumber = queue.shift();

          if (partNumber !== undefined) {
            await uploadPartWithRetry(partNumber);
          }
        }
      }
    );
    await Promise.all(workers);
    const completed = await transport.complete(session.uploadId);
    options.onProgress?.(100);
    return { session, completed };
  } catch (error) {
    if (options.signal?.aborted || (error as Error)?.name === 'AbortError') {
      await transport.abort(session.uploadId).catch(() => undefined);
      removePersistedMultipartUpload(file, options.persistenceKey);
    }

    throw error;
  }
};
