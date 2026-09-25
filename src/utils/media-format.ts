const HEIC_PATH_PATTERN = /\.(?:heic|heif)(?:[?#]|$)/i;

export const isHeicMediaPath = (value?: string | null): boolean =>
  Boolean(value && HEIC_PATH_PATTERN.test(value));

export const buildBrowserCompatibleImageUrl = (url: string): string => {
  if (!isHeicMediaPath(url) || /^(blob:|data:|file:\/\/)/i.test(url)) {
    return url;
  }

  try {
    const previewUrl = new URL(url, window.location.href);

    if (!previewUrl.pathname.includes('/media/object/')) {
      return url;
    }

    previewUrl.searchParams.set('preview', 'webp');
    return previewUrl.toString();
  } catch {
    return url;
  }
};
