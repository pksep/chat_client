const NOTO_EMOJI_PNG_BASE_PATH = '/emoji/noto/png/128';
const emojiAssetCandidateCache = new Map<string, string[]>();
const loadedEmojiAssetSources = new Set<string>();
const preloadedEmojiAssetSources = new Set<string>();

type EmojiAssetCandidatesOptions = {
  animated?: boolean;
};

type EmojiPreloadOptions = {
  highPriority?: boolean;
};

const toEmojiCodePointKey = (value: string): string =>
  Array.from(value)
    .map(character => character.codePointAt(0)?.toString(16))
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
  const cacheKey = `${normalizedKey}:${options.animated ? 'animated' : 'static'}`;
  const cachedCandidates = emojiAssetCandidateCache.get(cacheKey);

  if (cachedCandidates) {
    return cachedCandidates;
  }

  const fallbackKey = stripEmojiVariationSelectors(normalizedKey);
  const candidateKeys = buildUniqueCandidates([fallbackKey, normalizedKey]);
  const staticCandidates = buildUniqueCandidates(
    candidateKeys.map(
      key => `${NOTO_EMOJI_PNG_BASE_PATH}/${toNotoFileName(key)}.png`
    )
  );

  emojiAssetCandidateCache.set(cacheKey, staticCandidates);
  return staticCandidates;
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

  const sources = emojis.flatMap(emoji => getNotoEmojiAssetCandidates(emoji));

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
    image.src = source;
    image.onload = () => {
      markNotoEmojiAssetLoaded(source);
    };
  });
};
