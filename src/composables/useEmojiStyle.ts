import notoAnimatedCodepoints from '../utils/noto-animated-codepoints.json';

const DEFAULT_NOTO_EMOJI_ASSET_BASE_URL = '/emoji/noto';
const DEFAULT_NOTO_EMOJI_ANIMATION_ASSET_BASE_URL =
  'https://fonts.gstatic.com/s/e/notoemoji/latest';
const animatedCodepoints = new Map(
  notoAnimatedCodepoints.map(codepoint => [
    codepoint.replace(/_fe0[ef]/gi, ''),
    codepoint
  ])
);

export const NOTO_EMOJI_ANIMATION_ATTRIBUTION =
  'Animated Noto Emoji — Google. CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Источник: https://googlefonts.github.io/noto-emoji-animation/.';
const NOTO_EMOJI_FONT_STYLE_ID = 'chat-noto-emoji-font-faces';
const emojiAssetCandidateCache = new Map<string, string[]>();
const loadedEmojiAssetSources = new Set<string>();
const preloadedEmojiAssetSources = new Set<string>();
const failedEmojiAssetSources = new Set<string>();
const emojiAnimationDurationCache = new Map<string, Promise<number>>();
const playedEmojiAnimationKeys = new Set<string>();
const DEFAULT_EMOJI_ANIMATION_DURATION_MS = 3000;

type EmojiAssetCandidatesOptions = {
  animated?: boolean;
};

type EmojiPreloadOptions = {
  highPriority?: boolean;
  animated?: boolean;
};

const normalizeAssetBaseUrl = (value?: string): string => {
  const normalizedValue = value?.trim() || DEFAULT_NOTO_EMOJI_ASSET_BASE_URL;

  return normalizedValue.replace(/\/+$/, '');
};

export const getNotoEmojiAssetBaseUrl = (): string =>
  normalizeAssetBaseUrl(import.meta.env.VITE_EMOJI_ASSET_BASE_URL);

const getNotoEmojiPngBasePath = (): string =>
  `${getNotoEmojiAssetBaseUrl()}/png/128`;

const getNotoEmojiFontUrl = (fileName: string): string =>
  `${getNotoEmojiAssetBaseUrl()}/fonts/${fileName}`;

const escapeCssUrl = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '');

export const installNotoEmojiFontFaces = (
  options: { preferSystemFont?: boolean } = {}
): void => {
  if (
    typeof document === 'undefined' ||
    document.getElementById(NOTO_EMOJI_FONT_STYLE_ID)
  ) {
    return;
  }

  const style = document.createElement('style');
  // Android уже содержит Noto: не скачиваем многомегабайтные копии шрифта.
  const localSource = options.preferSystemFont
    ? "local('Noto Color Emoji'), local('NotoColorEmoji'), "
    : '';
  style.id = NOTO_EMOJI_FONT_STYLE_ID;
  style.textContent = `
@font-face {
  font-family: 'Noto Emoji COLRv1 Web';
  src: ${localSource}url("${escapeCssUrl(getNotoEmojiFontUrl('Noto-COLRv1.ttf'))}") format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'Noto Emoji Compat Web';
  src: ${localSource}url("${escapeCssUrl(getNotoEmojiFontUrl('Noto-COLRv1-emojicompat.ttf'))}") format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'Noto Emoji Windows Web';
  src: ${localSource}url("${escapeCssUrl(getNotoEmojiFontUrl('NotoColorEmoji_WindowsCompatible.ttf'))}") format('truetype');
  font-display: swap;
}

@font-face {
  font-family: 'Noto Color Emoji Web';
  src:
    local('Noto Color Emoji'),
    local('NotoColorEmoji'),
    url("${escapeCssUrl(getNotoEmojiFontUrl('NotoColorEmoji.ttf'))}") format('truetype');
  font-display: swap;
}
`.trim();
  document.head.append(style);
};

const toEmojiCodePointKey = (value: string): string =>
  Array.from(value)
    .map(character => {
      const codePoint = character.codePointAt(0);

      if (!codePoint) {
        return undefined;
      }

      const codePointHex = codePoint.toString(16).toLowerCase();

      return codePoint <= 0xffff ? codePointHex.padStart(4, '0') : codePointHex;
    })
    .filter((part): part is string => Boolean(part))
    .join('-')
    .toLowerCase();

const stripEmojiVariationSelectors = (codePointKey: string): string =>
  codePointKey.replace(/-fe0f/gi, '').replace(/-fe0e/gi, '');

const toNotoFileName = (codePointKey: string): string =>
  `emoji_u${codePointKey.replace(/-/g, '_')}`;

const buildUniqueCandidates = (values: string[]): string[] =>
  values.filter((value, index) => value && values.indexOf(value) === index);

const emojiSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

const EMOJI_GRAPHEME_PATTERN =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]|[#*0-9]\uFE0F?\u20E3|[\u00A9\u00AE\u2122]\uFE0F?)/u;

export const getNotoEmojiAssetCandidates = (
  emoji: string,
  options: EmojiAssetCandidatesOptions = {}
): string[] => {
  const normalizedKey = toEmojiCodePointKey(emoji);

  if (!normalizedKey) {
    return [];
  }

  const cacheKey = `${normalizedKey}:${options.animated ? 'animated' : 'static'}`;
  const cachedCandidates = emojiAssetCandidateCache.get(cacheKey);

  if (cachedCandidates) {
    return cachedCandidates.filter(
      source => !failedEmojiAssetSources.has(source)
    );
  }

  const fallbackKey = stripEmojiVariationSelectors(normalizedKey);
  const candidateKeys = buildUniqueCandidates([fallbackKey, normalizedKey]);
  const staticCandidates = buildUniqueCandidates(
    candidateKeys.map(
      key => `${getNotoEmojiPngBasePath()}/${toNotoFileName(key)}.png`
    )
  ).filter(source => !failedEmojiAssetSources.has(source));

  const animationCodepoint = options.animated
    ? animatedCodepoints.get(fallbackKey.replace(/-/g, '_'))
    : undefined;
  const animationBase = (
    import.meta.env.VITE_EMOJI_ANIMATION_ASSET_BASE_URL?.trim() ||
    DEFAULT_NOTO_EMOJI_ANIMATION_ASSET_BASE_URL
  ).replace(/\/+$/, '');
  const candidates = buildUniqueCandidates([
    ...(animationCodepoint
      ? [`${animationBase}/${animationCodepoint}/512.webp`]
      : []),
    ...staticCandidates
  ]).filter(source => !failedEmojiAssetSources.has(source));

  if (!candidates.length) {
    return [];
  }

  emojiAssetCandidateCache.set(cacheKey, candidates);
  return candidates;
};

export const hasFailedNotoEmojiAsset = (source: string): boolean =>
  failedEmojiAssetSources.has(source);

export const markNotoEmojiAssetFailed = (source: string): void => {
  if (source) {
    failedEmojiAssetSources.add(source);
  }
};

export const resetNotoEmojiAssetCandidateCache = (): void => {
  emojiAssetCandidateCache.clear();
};

export const extractEmojiGraphemes = (value: string): string[] => {
  if (!value) {
    return [];
  }

  const segments = emojiSegmenter
    ? Array.from(emojiSegmenter.segment(value), item => item.segment)
    : Array.from(value);

  return buildUniqueCandidates(
    segments.filter(segment => EMOJI_GRAPHEME_PATTERN.test(segment))
  );
};

export const hasLoadedNotoEmojiAsset = (source: string): boolean =>
  loadedEmojiAssetSources.has(source);

export const markNotoEmojiAssetLoaded = (source: string): void => {
  if (source) {
    loadedEmojiAssetSources.add(source);
  }
};

const getWebpAnimationDuration = (bytes: Uint8Array): number => {
  if (
    bytes.length < 20 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP'
  ) {
    return 0;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let durationMs = 0;
  let frameCount = 0;

  for (let position = 12; position + 8 <= bytes.length; ) {
    const size = view.getUint32(position + 4, true);

    if (position + 8 + size > bytes.length) {
      break;
    }

    if (
      String.fromCharCode(...bytes.subarray(position, position + 4)) ===
        'ANMF' &&
      size >= 16
    ) {
      durationMs += Math.max(
        10,
        bytes[position + 20] +
          (bytes[position + 21] << 8) +
          (bytes[position + 22] << 16)
      );
      frameCount += 1;
    }

    position += 8 + size + (size % 2);
  }

  return frameCount > 1 ? durationMs : 0;
};

export const getNotoEmojiAnimationDuration = (
  source: string
): Promise<number> => {
  if (!source.endsWith('/512.webp')) {
    return Promise.resolve(0);
  }

  const cachedDuration = emojiAnimationDurationCache.get(source);

  if (cachedDuration) {
    return cachedDuration;
  }

  const duration = fetch(source, { cache: 'force-cache' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Emoji animation request failed: ${response.status}`);
      }

      return response.arrayBuffer();
    })
    .then(buffer => getWebpAnimationDuration(new Uint8Array(buffer)))
    .then(durationMs => durationMs || DEFAULT_EMOJI_ANIMATION_DURATION_MS)
    .catch(() => DEFAULT_EMOJI_ANIMATION_DURATION_MS);

  emojiAnimationDurationCache.set(source, duration);
  return duration;
};

export const claimNotoEmojiAnimationPlayback = (
  animationKeys: readonly string[]
): string | null => {
  const keys = [...new Set(animationKeys.filter(Boolean))];
  const firstUnplayedKey = keys.find(key => !playedEmojiAnimationKeys.has(key));

  keys.forEach(key => playedEmojiAnimationKeys.add(key));
  return firstUnplayedKey || null;
};

const appendEmojiPreloadLink = (
  source: string,
  options: EmojiPreloadOptions
): void => {
  if (
    typeof document === 'undefined' ||
    !source ||
    preloadedEmojiAssetSources.has(source)
  ) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = source;

  if (options.highPriority) {
    link.setAttribute('fetchpriority', 'high');
  }

  document.head.append(link);
  preloadedEmojiAssetSources.add(source);
};

export const preloadNotoEmojiAssets = (
  emojis: string[],
  options: EmojiPreloadOptions = {}
): void => {
  if (typeof Image === 'undefined') {
    return;
  }

  const sources = buildUniqueCandidates(
    emojis
      .map(emoji => getNotoEmojiAssetCandidates(emoji, options)[0] || '')
      .filter(Boolean)
  );

  sources.forEach(source => {
    if (!source) {
      return;
    }

    appendEmojiPreloadLink(source, options);

    if (loadedEmojiAssetSources.has(source)) {
      return;
    }

    const image = new Image();
    image.decoding = 'sync';
    if (options.highPriority) {
      image.setAttribute('fetchpriority', 'high');
    }
    image.onload = () => {
      markNotoEmojiAssetLoaded(source);
    };
    image.onerror = () => {
      markNotoEmojiAssetFailed(source);
    };
    image.src = source;
  });
};
