const DOWNLOAD_FRAME_LIFETIME_MS = 10 * 60_000;

// Ссылки UI-kit скачивают вложения с другого origin через новую вкладку.
// Ответ media/object с downloadName уже имеет Content-Disposition: attachment:
// отдельный фрейм сохраняет потоковую загрузку без смены фокуса приложения.
export const initBrowserMediaDownloads = (): (() => void) => {
  const frames = new Map<HTMLIFrameElement, number>();
  const removeFrame = (frame: HTMLIFrameElement): void => {
    window.clearTimeout(frames.get(frame));
    frames.delete(frame);
    frame.remove();
  };

  const handleDownload = (event: MouseEvent): void => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>(
      'a[download][target="_blank"]'
    );
    if (!link) return;

    const url = new URL(link.href, window.location.href);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin === window.location.origin ||
      !url.pathname.includes('/media/object/') ||
      !url.searchParams.get('downloadName')
    )
      return;

    event.preventDefault();
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.title = 'Скачивание вложения';
    frame.src = url.href;
    frames.set(
      frame,
      window.setTimeout(() => removeFrame(frame), DOWNLOAD_FRAME_LIFETIME_MS)
    );
    document.body.append(frame);
  };

  document.addEventListener('click', handleDownload, true);
  return () => {
    document.removeEventListener('click', handleDownload, true);
    for (const frame of frames.keys()) removeFrame(frame);
  };
};
