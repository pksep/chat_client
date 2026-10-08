import type { IStickerPickerItem } from '@pksep/yui';
import { parseMessageEx } from './messageReplyQuote';
import type { IMedia } from '../components/interfaces/interfaces';
import { MediaType } from '@pksep/zod-shared-chat';
import { buildMediaObjectUrl } from './media-url';
import { getConfig } from '../services/useConfig';
import stickerDurations from './sticker-durations.json';

export type ChatStickerItem = IStickerPickerItem & {
  width?: number;
  height?: number;
  animationDurationMs?: number;
};

const stickerAssetBaseUrl = (
  import.meta.env?.VITE_STICKER_ASSET_BASE_URL?.trim() || '/stickers'
).replace(/\/+$/, '');

const robotSticker = (
  id: string,
  label: string,
  keywords: string[]
): IStickerPickerItem => ({
  id: `sep-robot-${id}`,
  label,
  src: `${stickerAssetBaseUrl}/sep-robots/v1/${id}.webp`,
  previewSrc: `${stickerAssetBaseUrl}/sep-robots/v1/previews/${id}.png`,
  keywords
});

// Порядок соответствует сетке стикеров в SEP-ERP Library.
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
      previewSrc: `${stickerAssetBaseUrl}/sep-robots/v1/message-previews/${sticker.id.replace('sep-robot-', '')}.png`
    }
  ])
);

export const getStickerById = (id: string): IStickerPickerItem | undefined =>
  stickersById.get(id);

export const createStickerMessage = (stickerId: string) => {
  const sticker = getStickerById(stickerId);
  if (!sticker) return null;

  return {
    text: `Стикер: ${sticker.label}`,
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
    sticker.pack !== 'sep-robots' ||
    sticker.version !== 1 ||
    typeof sticker.id !== 'string'
  ) {
    return null;
  }

  return messageStickersById.get(sticker.id) || null;
};
