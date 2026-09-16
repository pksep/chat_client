import { Capacitor } from '@capacitor/core';

let worker: Worker | undefined;
let workerUnavailable = false;
let nextId = 0;
const pending = new Map<
  number,
  {
    resolve: (url: string) => void;
    reject: () => void;
  }
>();

const disableWorker = () => {
  workerUnavailable = true;
  // Уже выданные ссылки принадлежат Worker: не завершаем его при ошибке запроса.
  for (const request of pending.values()) request.reject();
  pending.clear();
};

const getWorker = (): Worker => {
  if (worker) return worker;
  worker = new Worker(
    new URL('./media-object-url.worker.ts', import.meta.url),
    {
      type: 'module',
      name: 'chat-media-urls'
    }
  );
  worker.onmessage = (event: MessageEvent<{ id: number; url?: string }>) => {
    const request = pending.get(event.data.id);
    pending.delete(event.data.id);
    if (!request && event.data.url) URL.revokeObjectURL(event.data.url);
    if (event.data.url) request?.resolve(event.data.url);
    else request?.reject();
  };
  worker.onerror = disableWorker;
  worker.onmessageerror = disableWorker;
  return worker;
};

export const createMediaObjectUrl = async (blob: Blob): Promise<string> => {
  if (
    !workerUnavailable &&
    typeof Worker !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'
  ) {
    // В Android createObjectURL для Blob из IndexedDB синхронно ждёт IPC.
    // Worker сохраняется вместе со страницей: созданные ссылки остаются живыми.
    try {
      const activeWorker = getWorker();
      const id = ++nextId;
      return await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(disableWorker, 5000);
        pending.set(id, {
          resolve: url => {
            clearTimeout(timeout);
            resolve(url);
          },
          reject: () => {
            clearTimeout(timeout);
            reject(
              new Error('Не удалось подготовить ссылку на медиа в Worker')
            );
          }
        });
        try {
          activeWorker.postMessage({ id, blob });
        } catch {
          disableWorker();
        }
      });
    } catch {
      workerUnavailable = true;
      // Старый WebView или ошибка Worker сохраняют обычный путь загрузки медиа.
    }
  }
  return URL.createObjectURL(blob);
};
