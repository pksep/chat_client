export const MEDIA_CACHE_VERSION = 'nested-multipart-repair-20260918';

const LOCAL_URL_PATTERN = /^(blob:|data:|file:\/\/)/i;
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d+.-]*:\/\//i;

export const withMediaCacheVersion = (url: string): string => {
  if (!url || LOCAL_URL_PATTERN.test(url)) {
    return url;
  }

  try {
    const isAbsolute = ABSOLUTE_URL_PATTERN.test(url);
    const parsed = new URL(
      url,
      typeof window === 'undefined' ? 'http://localhost' : window.location.href
    );

    if (!/\/media\/object(?:\/|$)/.test(parsed.pathname)) {
      return url;
    }

    parsed.searchParams.set('v', MEDIA_CACHE_VERSION);

    return isAbsolute
      ? parsed.toString()
      : `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
};

export const buildMediaObjectUrl = (
  baseUrl: string | undefined,
  path: string
): string => {
  if (
    !path ||
    ABSOLUTE_URL_PATTERN.test(path) ||
    LOCAL_URL_PATTERN.test(path)
  ) {
    return withMediaCacheVersion(path);
  }

  return withMediaCacheVersion(
    `${baseUrl?.replace(/\/+$/, '') || ''}/${path.replace(/^\/+/, '')}`
  );
};
