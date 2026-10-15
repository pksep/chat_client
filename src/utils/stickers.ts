import type { IStickerPickerItem } from '@pksep/yui';
import { parseMessageEx } from './messageReplyQuote';
import type { IMedia } from '../components/interfaces/interfaces';
import { MediaType } from '@pksep/zod-shared-chat';
import { buildMediaObjectUrl } from './media-url';
import { getConfig } from '../services/useConfig';
import stickerDurations from './sticker-durations.json';
import { buildStickerAssetUrl } from './sticker-assets';
import { shallowReactive } from 'vue';

export interface StickerAssetDescriptor {
  path: string;
  previewPath: string;
  messagePreviewPath: string;
  width: number;
  height: number;
  format: 'webp' | 'webm' | 'tgs';
  animationDurationMs: number;
}

export interface CatalogSticker extends StickerAssetDescriptor {
  id: string;
  pack: string;
  version: number;
  label: string;
  keywords: string[];
  emoji?: string;
}

export type ChatStickerItem = IStickerPickerItem & {
  pack?: string;
  emoji?: string;
  width?: number;
  height?: number;
  animationDurationMs?: number;
  format?: 'webp' | 'webm' | 'tgs';
};

const robotSticker = (
  id: string,
  label: string,
  keywords: string[]
): IStickerPickerItem => ({
  id: `sep-robot-${id}`,
  label,
  get src() {
    return buildStickerAssetUrl(`sep-robots/v1/${id}.webp`);
  },
  get previewSrc() {
    return buildStickerAssetUrl(`sep-robots/v1/previews/${id}.png`);
  },
  keywords
});

// Метаданные старых сообщений; список доступных наборов загружается с сервера.
export const sepRobotStickers: readonly IStickerPickerItem[] = [
  robotSticker('heart', 'Любовь', [
    'любовь',
    'люблю',
    'влюблен',
    'сердце',
    'сердечки',
    'обожаю',
    'спасибо',
    'love',
    'heart',
    'romance',
    'thanks'
  ]),
  robotSticker('sad', 'Грусть', [
    'грусть',
    'грустный',
    'печаль',
    'плачу',
    'слезы',
    'жаль',
    'sad',
    'cry',
    'tears',
    'sorry',
    'upset'
  ]),
  robotSticker('yes', 'Да', [
    'да',
    'ага',
    'ок',
    'окей',
    'хорошо',
    'согласен',
    'согласие',
    'понял',
    'принято',
    'yes',
    'ok',
    'okay',
    'agree',
    'understood',
    'approve',
    'nod'
  ]),
  robotSticker('happy', 'Радость', [
    'радость',
    'радостный',
    'весело',
    'веселье',
    'улыбка',
    'смех',
    'счастье',
    'привет',
    'здравствуй',
    'доброе утро',
    'happy',
    'smile',
    'laugh',
    'joy',
    'hello',
    'hi',
    'good morning'
  ]),
  robotSticker('thinking', 'Думаю', [
    'думаю',
    'думать',
    'размышляю',
    'мысль',
    'задумался',
    'вопрос',
    'ожидание',
    'загрузка',
    'think',
    'thinking',
    'hmm',
    'question',
    'wait',
    'loading'
  ]),
  robotSticker('devil', 'Хитрость', [
    'хитрость',
    'хитрый',
    'дьявол',
    'черт',
    'шалость',
    'коварный',
    'озорной',
    'devil',
    'evil',
    'sly',
    'mischief',
    'naughty'
  ]),
  robotSticker('star-eyes', 'Восторг', [
    'восторг',
    'восхищение',
    'красота',
    'звездные глаза',
    'звездочки',
    'вау',
    'круто',
    'wow',
    'amazing',
    'admire',
    'excited',
    'stars',
    'star eyes'
  ]),
  robotSticker('sleepy', 'Сон', [
    'сон',
    'спать',
    'сонный',
    'устал',
    'усталость',
    'зевота',
    'скучно',
    'спокойной ночи',
    'sleep',
    'sleepy',
    'tired',
    'yawn',
    'bored',
    'good night'
  ]),
  robotSticker('shy', 'Смущение', [
    'смущение',
    'смущаюсь',
    'стесняюсь',
    'застенчивый',
    'скромный',
    'румянец',
    'shy',
    'blush',
    'embarrassed',
    'bashful'
  ]),
  robotSticker('surprised', 'Удивление', [
    'удивление',
    'удивлен',
    'ого',
    'шок',
    'неожиданно',
    'ничего себе',
    'surprise',
    'surprised',
    'shock',
    'gasp',
    'omg'
  ]),
  robotSticker('cool', 'Крутой', [
    'крутой',
    'круто',
    'класс',
    'очки',
    'красавчик',
    'уверенность',
    'cool',
    'awesome',
    'sunglasses',
    'confident',
    'nice'
  ]),
  robotSticker('starstruck', 'Звёзды', [
    'звезды',
    'звездный',
    'звездочки',
    'восторг',
    'успех',
    'супер',
    'восхищен',
    'star',
    'starstruck',
    'sparkle',
    'success',
    'super',
    'wow'
  ]),
  robotSticker('angry', 'Злость', [
    'злость',
    'злой',
    'злюсь',
    'злюсь',
    'сердитый',
    'гнев',
    'бесит',
    'недоволен',
    'angry',
    'anger',
    'mad',
    'rage',
    'annoyed'
  ]),
  robotSticker('confused', 'Непонимание', [
    'непонимание',
    'непонятно',
    'не понимаю',
    'сомнение',
    'растерян',
    'озадачен',
    'странно',
    'confused',
    'confusion',
    'unsure',
    'puzzled',
    'grimace'
  ]),
  robotSticker('dizzy', 'Головокружение', [
    'головокружение',
    'голова кругом',
    'кружится',
    'запутался',
    'ошеломлен',
    'спираль',
    'dizzy',
    'dizziness',
    'spiral',
    'overwhelmed'
  ])
];

export const chatStickers = sepRobotStickers;

const stickersById = new Map(
  chatStickers.map(sticker => [sticker.id, sticker])
);

// В сообщении превью повторяет первый кадр, включая прозрачные поля.
const messageStickersById = new Map(
  chatStickers.map(sticker => [
    sticker.id,
    {
      ...sticker,
      animationDurationMs: (stickerDurations as Record<string, number>)[
        sticker.id
      ],
      previewPath: `sep-robots/v1/message-previews/${sticker.id.replace('sep-robot-', '')}.png`
    }
  ])
);

export const getStickerById = (id: string): IStickerPickerItem | undefined =>
  catalogStickersById.has(id)
    ? catalogStickerToPickerItem(catalogStickersById.get(id)!)
    : stickersById.get(id);

const catalogStickersById = shallowReactive(new Map<string, CatalogSticker>());
const catalogStickersByReference = shallowReactive(
  new Map<string, CatalogSticker>()
);
const referenceKey = (sticker: { id: string; pack: string; version: number }) =>
  `${sticker.pack}:${sticker.id}:${sticker.version}`;
export const getCatalogSticker = (reference: {
  id: string;
  pack: string;
  version: number;
}) => catalogStickersByReference.get(referenceKey(reference));

export const getStickerReference = (messageEx: unknown) => {
  const ex = parseMessageEx(messageEx);
  const sticker = ex.sticker as Partial<CopiedSticker> | undefined;
  return ex.kind === 'sticker' &&
    sticker &&
    typeof sticker.id === 'string' &&
    typeof sticker.pack === 'string' &&
    sticker.pack !== 'keyboard' &&
    Number.isInteger(sticker.version) &&
    Number(sticker.version) > 0
    ? { id: sticker.id, pack: sticker.pack, version: sticker.version! }
    : null;
};

export const findStickerEmoji = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const emoji = value.match(
      /\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*/u
    )?.[0];
    if (emoji) return emoji;
  }
  return '';
};
const getStickerEmoji = (sticker?: CatalogSticker, ...fallback: unknown[]) =>
  findStickerEmoji(sticker?.emoji, ...fallback, ...(sticker?.keywords || []));
const stickerPreviewText = (emoji: string) =>
  emoji ? `${emoji} Стикер` : 'Стикер';

export const getStickerMessagePreview = (
  messageEx: unknown,
  text?: string
): string | null => {
  const ex = parseMessageEx(messageEx);
  if (ex.kind !== 'sticker' || !ex.sticker) return null;
  const reference = getStickerReference(ex);
  const catalog = reference ? getCatalogSticker(reference) : undefined;
  return stickerPreviewText(
    getStickerEmoji(catalog, ex.stickerEmoji) || findStickerEmoji(text)
  );
};
export const registerCatalogStickers = (
  stickers: readonly CatalogSticker[]
) => {
  for (const sticker of stickers) {
    if (
      isStickerAssetDescriptor(sticker) &&
      typeof sticker.id === 'string' &&
      typeof sticker.pack === 'string' &&
      Number.isInteger(sticker.version)
    ) {
      catalogStickersByReference.set(referenceKey(sticker), sticker);
      const current = catalogStickersById.get(sticker.id);
      if (!current || current.version <= sticker.version)
        catalogStickersById.set(sticker.id, sticker);
    }
  }
};

export const catalogStickerToPickerItem = (
  sticker: CatalogSticker
): ChatStickerItem => ({
  id: sticker.id,
  pack: sticker.pack,
  emoji: getStickerEmoji(sticker),
  label: sticker.label,
  src: buildStickerAssetUrl(sticker.path),
  previewSrc: buildStickerAssetUrl(sticker.previewPath),
  width: sticker.width,
  height: sticker.height,
  format: sticker.format,
  animationDurationMs: sticker.animationDurationMs,
  keywords: sticker.keywords
});

const isStickerAssetDescriptor = (
  value: unknown
): value is StickerAssetDescriptor => {
  if (!value || typeof value !== 'object') return false;
  const asset = value as StickerAssetDescriptor;
  const validPath = (path: unknown) =>
    typeof path === 'string' &&
    /^(?:objects\/[a-f0-9]{64}\.(?:webp|webm|tgs|png|jpg)|sep-robots\/v1\/(?:previews\/|message-previews\/)?[a-z-]+\.(?:webp|png))$/.test(
      path
    );
  return (
    validPath(asset.path) &&
    validPath(asset.previewPath) &&
    validPath(asset.messagePreviewPath) &&
    Number.isInteger(asset.width) &&
    asset.width > 0 &&
    asset.width <= 4096 &&
    Number.isInteger(asset.height) &&
    asset.height > 0 &&
    asset.height <= 4096 &&
    ['webp', 'webm', 'tgs'].includes(asset.format) &&
    Number.isFinite(asset.animationDurationMs) &&
    asset.animationDurationMs >= 0
  );
};

export interface CopiedSticker {
  id: string;
  pack: string;
  version: number;
  asset?: StickerAssetDescriptor;
  label: string;
  emoji?: string;
}

export const createStickerMessage = (stickerId: string | CopiedSticker) => {
  if (typeof stickerId !== 'string') {
    const { id, pack, version, asset, emoji } = stickerId;
    const reference = { id, pack, version, ...(asset ? { asset } : {}) };
    if (!getMessageSticker({ kind: 'sticker', sticker: reference }))
      return null;
    const catalog = getCatalogSticker(reference);
    const stickerEmoji = getStickerEmoji(catalog, emoji);
    return {
      text: stickerPreviewText(stickerEmoji),
      metadata: { kind: 'sticker', sticker: reference, stickerEmoji }
    };
  }
  const sticker = getStickerById(stickerId);
  if (!sticker) return null;

  const catalogSticker = catalogStickersById.get(stickerId);
  if (catalogSticker) {
    const {
      path,
      previewPath,
      messagePreviewPath,
      width,
      height,
      format,
      animationDurationMs
    } = catalogSticker;
    const stickerEmoji = getStickerEmoji(catalogSticker);
    return {
      text: stickerPreviewText(stickerEmoji),
      metadata: {
        kind: 'sticker',
        stickerEmoji,
        sticker: {
          id: catalogSticker.id,
          pack: catalogSticker.pack,
          version: catalogSticker.version,
          asset: {
            path,
            previewPath,
            messagePreviewPath,
            width,
            height,
            format,
            animationDurationMs
          }
        }
      }
    };
  }

  return {
    text: stickerPreviewText(findStickerEmoji(...(sticker.keywords || []))),
    metadata: {
      kind: 'sticker',
      sticker: {
        id: sticker.id,
        pack: 'sep-robots',
        version: 1
      }
    }
  };
};

export const getMessageSticker = (
  messageEx: unknown,
  media: readonly IMedia[] = []
): ChatStickerItem | null => {
  const ex = parseMessageEx(messageEx);
  if (ex.kind !== 'sticker' || !ex.sticker || typeof ex.sticker !== 'object') {
    return null;
  }

  const sticker = ex.sticker as Record<string, unknown>;
  if (sticker.pack === 'keyboard' && sticker.version === 1) {
    const image =
      media.length === 1 && media[0].type === MediaType.Image ? media[0] : null;
    if (!image || (!image.path && !image.localPath)) return null;
    const dimensions = image.ex;
    return {
      id: `keyboard-${image.id}`,
      label: 'Стикер из клавиатуры',
      animationDurationMs: Math.max(
        0,
        Math.min(600000, Number(sticker.durationMs) || 0)
      ),
      previewSrc:
        image.localThumbnailPath ||
        (image.thumbnailPath
          ? buildMediaObjectUrl(
              getConfig().CHAT_PATH_TO_FILE_CDN,
              image.thumbnailPath
            )
          : undefined),
      src:
        image.localPath ||
        buildMediaObjectUrl(getConfig().CHAT_PATH_TO_FILE_CDN, image.path),
      width: Math.max(1, Math.min(4096, Number(dimensions?.width) || 512)),
      height: Math.max(1, Math.min(4096, Number(dimensions?.height) || 512)),
      keywords: []
    };
  }
  if (media.length) return null;
  if (
    typeof sticker.id === 'string' &&
    typeof sticker.pack === 'string' &&
    Number.isInteger(sticker.version) &&
    isStickerAssetDescriptor(sticker.asset)
  ) {
    const asset = sticker.asset;
    return {
      id: sticker.id,
      pack: sticker.pack,
      emoji: getStickerEmoji(
        getCatalogSticker({
          id: sticker.id,
          pack: sticker.pack,
          version: Number(sticker.version)
        }),
        ex.stickerEmoji
      ),
      label: catalogStickersById.get(sticker.id)?.label || 'Стикер',
      src: buildStickerAssetUrl(asset.path),
      previewSrc: buildStickerAssetUrl(asset.messagePreviewPath),
      width: asset.width,
      height: asset.height,
      format: asset.format,
      animationDurationMs: asset.animationDurationMs,
      keywords: []
    };
  }
  if (
    sticker.pack !== 'sep-robots' ||
    sticker.version !== 1 ||
    typeof sticker.id !== 'string'
  ) {
    return null;
  }

  const messageSticker = messageStickersById.get(sticker.id);
  return messageSticker
    ? {
        ...messageSticker,
        pack: 'sep-robots',
        src: buildStickerAssetUrl(
          `sep-robots/v1/${sticker.id.replace('sep-robot-', '')}.webp`
        ),
        previewSrc: buildStickerAssetUrl(messageSticker.previewPath),
        width: 512,
        height: 512
      }
    : null;
};
