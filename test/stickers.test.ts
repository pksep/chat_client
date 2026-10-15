import { describe, expect, test } from 'bun:test';
import {
  chatStickers,
  sepRobotStickers,
  createStickerMessage,
  getMessageSticker,
  getStickerById,
  registerCatalogStickers,
  findStickerEmoji,
  getStickerMessagePreview,
  type CatalogSticker
} from '../src/utils/stickers';

describe('стикеры', () => {
  test('история использует сохранённый оригинал, даже когда каталог ещё не загружен или уже обновлён', () => {
    const asset = {
      path: `objects/${'1'.repeat(64)}.webm`,
      previewPath: `objects/${'2'.repeat(64)}.webp`,
      messagePreviewPath: `objects/${'3'.repeat(64)}.webp`,
      width: 512,
      height: 384,
      format: 'webm' as const,
      animationDurationMs: 0
    };
    const oldMessage = {
      kind: 'sticker',
      sticker: { id: 'history-test', pack: 'local-test', version: 1, asset }
    };
    expect(getMessageSticker(oldMessage)?.src).toEndWith(asset.path);
    registerCatalogStickers([
      {
        ...asset,
        id: 'history-test',
        pack: 'local-test',
        version: 2,
        path: `objects/${'4'.repeat(64)}.webm`,
        label: 'Новая версия',
        keywords: []
      } satisfies CatalogSticker
    ]);
    expect(createStickerMessage('history-test')?.metadata.sticker.version).toBe(
      2
    );
    expect(
      createStickerMessage({
        ...oldMessage.sticker,
        label: 'Скопированный стикер'
      })?.metadata.sticker
    ).toEqual(oldMessage.sticker);
    const restored = getMessageSticker(JSON.stringify(oldMessage));
    expect(restored?.src).toEndWith(asset.path);
    expect(restored?.width).toBe(512);
    expect(restored?.height).toBe(384);
    expect(restored?.format).toBe('webm');
    for (const path of ['https://example.com/sticker.webp', '../secret.webp']) {
      expect(
        getMessageSticker({
          ...oldMessage,
          sticker: { ...oldMessage.sticker, asset: { ...asset, path } }
        })
      ).toBeNull();
    }
  });

  test('сохраняют порядок из Figma и уникальные идентификаторы', () => {
    expect(
      sepRobotStickers.map(sticker => sticker.id.replace('sep-robot-', ''))
    ).toEqual([
      'heart',
      'sad',
      'yes',
      'happy',
      'thinking',
      'devil',
      'star-eyes',
      'sleepy',
      'shy',
      'surprised',
      'cool',
      'starstruck',
      'angry',
      'confused',
      'dizzy'
    ]);
    expect(chatStickers.slice(0, 15)).toEqual(sepRobotStickers);
    expect(chatStickers).toEqual(sepRobotStickers);
    expect(chatStickers).toHaveLength(15);
    expect(new Set(chatStickers.map(sticker => sticker.id)).size).toBe(15);
  });

  test('сообщение содержит только идентификатор и доступный текст для старых клиентов', () => {
    const message = createStickerMessage('sep-robot-heart');
    expect(message?.text).toBe('Стикер');
    expect(message?.metadata.sticker).toEqual({
      id: 'sep-robot-heart',
      pack: 'sep-robots',
      version: 1
    });
    expect(createStickerMessage('unknown')).toBeNull();
  });

  test('в превью и тексте уведомления сохраняется эмодзи Telegram, включая составные эмодзи', () => {
    const sticker: CatalogSticker = {
      id: 'preview-emoji',
      pack: 'test-preview',
      version: 1,
      label: 'Набор 2',
      keywords: ['test', 'sad', '😢', '😥'],
      emoji: '😎',
      path: `objects/${'7'.repeat(64)}.webp`,
      previewPath: `objects/${'8'.repeat(64)}.webp`,
      messagePreviewPath: `objects/${'8'.repeat(64)}.webp`,
      width: 233,
      height: 512,
      format: 'webp',
      animationDurationMs: 0
    };
    registerCatalogStickers([sticker]);
    const sent = createStickerMessage(sticker.id)!;
    expect(sent.text).toBe('😎 Стикер');
    expect(sent.metadata).toMatchObject({ stickerEmoji: '😎' });
    expect(getMessageSticker(sent.metadata)?.pack).toBe(sticker.pack);
    expect(getStickerMessagePreview(sent.metadata, sent.text)).toBe(
      '😎 Стикер'
    );
    expect(
      getStickerMessagePreview({ kind: 'sticker', sticker }, 'Стикер: Набор 2')
    ).toBe('😎 Стикер');
    expect(
      createStickerMessage({
        ...sent.metadata.sticker,
        label: 'Набор 2',
        emoji: '😢'
      })?.text
    ).toBe('😎 Стикер');
    expect(
      getStickerMessagePreview(
        { kind: 'sticker', sticker: { id: 'unknown' } },
        'Стикер: Набор 99'
      )
    ).toBe('Стикер');
    expect(getStickerMessagePreview({}, 'Обычный текст 😢')).toBeNull();
    for (const emoji of ['👍🏽', '👨‍👩‍👧‍👦', '🇦🇲', '1️⃣'])
      expect(findStickerEmoji('не эмодзи', emoji, '😢')).toBe(emoji);
    expect(
      findStickerEmoji('🐟 😎', '🐟', '❤', '❤️', '👍🏽', '👨‍👩‍👧‍👦', '🇦🇲', '1️⃣')
    ).toBe('🐟');
    expect(
      getStickerMessagePreview({ ...sent.metadata, stickerEmoji: '🐟' })
    ).toBe('😎 Стикер');
    expect(getMessageSticker(sent.metadata)?.emoji).toBe('😎');
    expect(getStickerById(sticker.id)).toMatchObject({ emoji: '😎' });
    expect(
      getStickerMessagePreview({
        kind: 'sticker',
        sticker: { id: 'not-loaded' },
        stickerEmoji: '🇦🇲'
      })
    ).toBe('🇦🇲 Стикер');
    registerCatalogStickers([
      { ...sticker, id: 'no-primary', emoji: undefined }
    ]);
    expect(createStickerMessage('no-primary')?.text).toBe('😢 Стикер');
  });

  test('показывают тот же стикер после сериализации и пересылки', () => {
    const message = createStickerMessage('sep-robot-angry')!;
    expect(getMessageSticker(message.metadata)?.id).toBe('sep-robot-angry');
    expect(
      getMessageSticker(
        JSON.stringify({
          ...message.metadata,
          clientId: 'copy',
          forwardBatchId: 'batch'
        })
      )?.id
    ).toBe('sep-robot-angry');
  });

  test('удалённые экспериментальные наборы нельзя отправить без серверных метаданных', () => {
    for (const [id, pack] of [
      ['fluent-hello', 'fluent-emoji'],
      ['noto-wink', 'noto-emoji']
    ]) {
      expect(createStickerMessage(id)).toBeNull();
      expect(
        getMessageSticker({
          kind: 'sticker',
          sticker: { id, pack, version: 1 }
        })
      ).toBeNull();
    }
  });

  test('серверная версия заменяет прежние метаданные того же стикера', () => {
    const sticker: CatalogSticker = {
      id: 'sep-robot-cool',
      pack: 'sep-robots',
      version: 2,
      label: 'Обновлённый стикер',
      keywords: [],
      path: `objects/${'5'.repeat(64)}.tgs`,
      previewPath: `objects/${'6'.repeat(64)}.png`,
      messagePreviewPath: `objects/${'6'.repeat(64)}.png`,
      width: 512,
      height: 512,
      format: 'tgs',
      animationDurationMs: 1000
    };
    registerCatalogStickers([sticker]);
    expect(getStickerById(sticker.id)?.src).toEndWith(sticker.path);
    expect(createStickerMessage(sticker.id)?.metadata.sticker).toMatchObject({
      version: 2,
      asset: { path: sticker.path, format: 'tgs' }
    });
    expect(
      getMessageSticker({
        kind: 'sticker',
        sticker: {
          id: sticker.id,
          pack: sticker.pack,
          version: 1
        }
      })?.src
    ).toEndWith('sep-robots/v1/cool.webp');
  });

  test('не превращают обычные сообщения и произвольные ссылки в стикеры', () => {
    for (const ex of [
      null,
      [],
      'broken json',
      '{}',
      { sticker: { id: 'sep-robot-heart' } },
      {
        kind: 'sticker',
        sticker: {
          id: 'https://example.com/image.webp',
          pack: 'sep-robots',
          version: 1
        }
      },
      {
        kind: 'sticker',
        sticker: { id: 'sep-robot-heart', pack: 'unknown', version: 1 }
      },
      {
        kind: 'sticker',
        sticker: { id: 'sep-robot-heart', pack: 'sep-robots', version: 2 }
      }
    ])
      expect(getMessageSticker(ex)).toBeNull();
  });
});
