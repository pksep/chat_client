import { isIosWeb } from './ios-pwa-viewport';

// WebKit может оставить XHR незавершённым после заморозки PWA.
// Прерывание отдаёт файл существующей очереди повторной отправки.
export const watchIosUpload = (xhr: XMLHttpRequest, onTimeout?: () => void) => {
  if (!isIosWeb()) return () => {};
  const idleLimit = 30_000;
  let lastProgressAt = Date.now();
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    clearTimeout(timer);
    if (document.hidden) return;
    const remaining = idleLimit - (Date.now() - lastProgressAt);
    if (remaining <= 0) {
      onTimeout?.();
      xhr.abort();
    } else timer = setTimeout(schedule, remaining);
  };
  const progress = () => {
    lastProgressAt = Date.now();
    schedule();
  };
  const cleanup = () => {
    clearTimeout(timer);
    xhr.upload.removeEventListener('progress', progress);
    xhr.removeEventListener('loadend', cleanup);
    document.removeEventListener('visibilitychange', schedule);
  };
  xhr.upload.addEventListener('progress', progress);
  xhr.addEventListener('loadend', cleanup);
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return cleanup;
};
