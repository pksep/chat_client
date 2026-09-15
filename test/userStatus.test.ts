import { describe, expect, test } from 'bun:test';
import {
  getCustomUserStatusPresets,
  USER_STATUS_PRESETS
} from '../src/utils/userStatus';

describe('getCustomUserStatusPresets', () => {
  const custom = { icon: '💻', text: 'Работаю удалённо' };

  test('читает варианты сервера без дублей и встроенных статусов', () => {
    expect(
      getCustomUserStatusPresets(
        {
          customStatusPresets: [
            custom,
            ...USER_STATUS_PRESETS,
            { icon: ' 💻 ', text: ' Работаю удалённо ' }
          ]
        },
        custom
      )
    ).toEqual([custom]);
  });

  test('читает JSON-формат, не возвращая удалённый текущий статус', () => {
    expect(
      getCustomUserStatusPresets(
        JSON.stringify({
          customStatusPresets: [{ icon: '☕', text: 'Перерыв' }]
        }),
        custom
      )
    ).toEqual([{ icon: '☕', text: 'Перерыв' }]);
    expect(
      getCustomUserStatusPresets({ customStatusPresets: [] }, custom)
    ).toEqual([]);
  });

  test('подхватывает текущий свой статус только в старом профиле без списка', () => {
    expect(getCustomUserStatusPresets({}, custom)).toEqual([custom]);
    expect(getCustomUserStatusPresets('null', custom)).toEqual([custom]);
  });

  test('игнорирует некорректные данные', () => {
    for (const ex of [
      null,
      'null',
      '[]',
      '{',
      [],
      { customStatusPresets: {} },
      {
        customStatusPresets: [
          null,
          1,
          {},
          { icon: 7, text: 'Текст' },
          { icon: ' ', text: 'Текст' }
        ]
      }
    ]) {
      expect(getCustomUserStatusPresets(ex)).toEqual([]);
    }
  });
});
