import { describe, expect, test } from 'bun:test';
import {
  chatStickers,
  sepRobotStickers,
  createStickerMessage,
  getMessageSticker
} from '../src/utils/stickers';

describe('стикеры', () => {
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
    expect(message?.text).toBe('Стикер: Любовь');
    expect(message?.metadata.sticker).toEqual({
      id: 'sep-robot-heart',
      pack: 'sep-robots',
      version: 1
    });
    expect(createStickerMessage('unknown')).toBeNull();
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

  test('каталог и отправка содержат только локальные стикеры', () => {
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
