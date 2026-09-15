import {
  ensureMediaObjectUrl,
  loadCachedMediaObjectUrl
} from './useMediaBlobCache';

const MAX_RETAINED_AVATAR_IMAGES = 64;
const readyAvatarImages = new Map<string, HTMLImageElement>();
const pendingAvatarImages = new Map<string, Promise<boolean>>();

export const hasVerifiedAvatarUrl = (url: string): boolean =>
  readyAvatarImages.has(url);

const retainReadyAvatarImage = (url: string, image: HTMLImageElement): void => {
  readyAvatarImages.delete(url);
  readyAvatarImages.set(url, image);

  while (readyAvatarImages.size > MAX_RETAINED_AVATAR_IMAGES) {
    const oldestUrl = readyAvatarImages.keys().next().value;
    if (typeof oldestUrl !== 'string') break;
    readyAvatarImages.delete(oldestUrl);
  }
};

export const preloadAvatarImage = (url: string): Promise<boolean> => {
  if (!url) return Promise.resolve(false);

  const readyImage = readyAvatarImages.get(url);
  if (readyImage) {
    retainReadyAvatarImage(url, readyImage);
    return Promise.resolve(true);
  }

  const pendingImage = pendingAvatarImages.get(url);
  if (pendingImage) return pendingImage;
  if (typeof Image === 'undefined') return Promise.resolve(true);

  const image = new Image();
  image.decoding = 'sync';
  image.loading = 'eager';
  image.fetchPriority = 'high';

  const pending = new Promise<boolean>(resolve => {
    let settled = false;
    const finish = async (loaded: boolean): Promise<void> => {
      if (settled) return;
      settled = true;

      if (loaded && typeof image.decode === 'function') {
        try {
          await image.decode();
        } catch {
          loaded = image.complete && image.naturalWidth > 0;
        }
      }

      const ready = loaded && image.naturalWidth > 0;
      if (ready) retainReadyAvatarImage(url, image);
      resolve(ready);
    };

    image.onload = () => void finish(true);
    image.onerror = () => void finish(false);
    image.src = url;
    if (image.complete && image.naturalWidth > 0) void finish(true);
  }).finally(() => {
    pendingAvatarImages.delete(url);
  });

  pendingAvatarImages.set(url, pending);
  return pending;
};

const isLocalDirectAvatarUrl = (path: string): boolean =>
  /^(blob:|data:|file:\/\/)/i.test(path);

export const preloadAvatarPath = async (
  path?: string | null,
  opts?: { allowNetwork?: boolean }
): Promise<boolean> => {
  if (!path) return false;

  let url: string | null;
  if (isLocalDirectAvatarUrl(path)) {
    url = path;
  } else {
    url = opts?.allowNetwork
      ? await ensureMediaObjectUrl(path)
      : await loadCachedMediaObjectUrl(path);
  }

  return url ? preloadAvatarImage(url) : false;
};
