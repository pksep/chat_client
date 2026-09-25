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

interface BrowserDownload {
  url: string;
  fileName: string;
}

const OBJECT_URL_CLEANUP_DELAY = 60_000;

export const triggerBrowserDownloads = (
  downloads: BrowserDownload[]
): Promise<void> => {
  if (downloads.length === 1 && downloads[0]) {
    triggerBrowserDownload(downloads[0].url, downloads[0].fileName);
    return Promise.resolve();
  }

  return Promise.all(
    downloads.map(async ({ url, fileName }) => {
      const downloadUrl = buildMediaDownloadUrl(url, fileName);

      try {
        const response = await fetch(downloadUrl, { credentials: 'include' });

        if (!response.ok) {
          throw new Error(`Failed to download file: ${response.status}`);
        }

        return {
          fileName,
          objectUrl: URL.createObjectURL(await response.blob())
        };
      } catch {
        return { fileName, objectUrl: downloadUrl };
      }
    })
  ).then(preparedDownloads => {
    preparedDownloads.forEach(({ objectUrl, fileName }) => {
      triggerBrowserDownload(objectUrl, fileName);

      if (objectUrl.startsWith('blob:')) {
        window.setTimeout(
          () => URL.revokeObjectURL(objectUrl),
          OBJECT_URL_CLEANUP_DELAY
        );
      }
    });
  });
};
