import type { CallReaction } from './useCallState';

const DEFAULT_REACTION_VIDEO_ASSET_BASE_URL = '/video';

const REACTION_VIDEO_FILE_NAMES: Record<CallReaction, string> = {
  heart: 'heart-fullscreen-zoomlike-transparent.webm',
  joy: 'joy-fullscreen-zoomlike-transparent.webm',
  sob: 'sob-fullscreen-zoomlike-transparent.webm',
  'thumbs-up': 'thumbs-up-fullscreen-zoomlike-transparent.webm',
  'thumbs-down': 'thumbs-down-fullscreen-zoomlike-transparent.webm'
};

const normalizeAssetBaseUrl = (value?: string): string => {
  const normalizedValue =
    value?.trim() || DEFAULT_REACTION_VIDEO_ASSET_BASE_URL;

  return normalizedValue.replace(/\/+$/, '');
};

export const getCallReactionVideoAssetBaseUrl = (): string =>
  normalizeAssetBaseUrl(import.meta.env.VITE_REACTION_VIDEO_ASSET_BASE_URL);

export const areCallReactionVideosExternalized = (): boolean =>
  Boolean(import.meta.env.VITE_REACTION_VIDEO_ASSET_BASE_URL?.trim());

export const getCallReactionVideoSrc = (
  reaction?: CallReaction | null
): string => {
  if (!reaction) {
    return '';
  }

  const fileName = REACTION_VIDEO_FILE_NAMES[reaction];

  return fileName ? `${getCallReactionVideoAssetBaseUrl()}/${fileName}` : '';
};

export const getCallReactionVideoPreloadSources = (): string[] => {
  if (areCallReactionVideosExternalized()) {
    return [];
  }

  return Object.keys(REACTION_VIDEO_FILE_NAMES).map(reaction =>
    getCallReactionVideoSrc(reaction as CallReaction)
  );
};
