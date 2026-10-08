import { describe, expect, test } from 'bun:test';
import {
  getNotoEmojiAssetCandidates,
  markNotoEmojiAssetFailed
} from '../src/composables/useEmojiStyle';

describe('анимация одного эмодзи', () => {
  test('обычные эмодзи продолжают использовать локальные PNG', () => {
    expect(getNotoEmojiAssetCandidates('🙂')).toEqual([
      '/emoji/noto/png/128/emoji_u1f642.png'
    ]);
  });

  test('для анимации выбирает Google WebP со статичным запасным изображением', () => {
    expect(getNotoEmojiAssetCandidates('🙂', { animated: true })).toEqual([
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f642/512.webp',
      '/emoji/noto/png/128/emoji_u1f642.png'
    ]);
  });

  test('учитывает селекторы варианта и оттенок кожи', () => {
    for (const emoji of ['❤', '❤️']) {
      expect(getNotoEmojiAssetCandidates(emoji, { animated: true })[0]).toBe(
        'https://fonts.gstatic.com/s/e/notoemoji/latest/2764_fe0f/512.webp'
      );
    }
    expect(getNotoEmojiAssetCandidates('👍🏽', { animated: true })[0]).toBe(
      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d_1f3fd/512.webp'
    );
  });

  test('для неподдерживаемых анимаций сразу выбирает локальное изображение', () => {
    const sources = getNotoEmojiAssetCandidates('🇦🇲', { animated: true });
    expect(sources).toEqual(['/emoji/noto/png/128/emoji_u1f1e6_1f1f2.png']);
  });

  test('ошибка CDN сохраняет PNG и не вызывает повторную загрузку неисправного URL', () => {
    const sources = getNotoEmojiAssetCandidates('💥', { animated: true });
    markNotoEmojiAssetFailed(sources[0]);
    expect(getNotoEmojiAssetCandidates('💥', { animated: true })).toEqual([
      '/emoji/noto/png/128/emoji_u1f4a5.png'
    ]);
  });
});
