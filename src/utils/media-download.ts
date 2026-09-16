const isLocalObjectUrl = (url: string): boolean =>
  /^(blob:|data:|file:\/\/)/i.test(url);

export const buildMediaDownloadUrl = (
  url: string,
  fileName: string
): string => {
  if (!url || isLocalObjectUrl(url)) {
    return url;
  }

  try {
    const downloadUrl = new URL(url, window.location.href);

    if (!downloadUrl.pathname.includes('/media/object/')) {
      return downloadUrl.toString();
    }

    downloadUrl.searchParams.delete('preview');
    downloadUrl.searchParams.set('downloadName', fileName || 'file');
    return downloadUrl.toString();
  } catch {
    return url;
  }
};

export const triggerBrowserDownload = (url: string, fileName: string): void => {
  const link = document.createElement('a');

  link.href = buildMediaDownloadUrl(url, fileName);
  link.download = fileName || 'file';
  document.body.appendChild(link);
  link.click();
  link.remove();
};
