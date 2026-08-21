import { expect, test } from '@playwright/test';
import { resolveLastMessageAfterLocalSync } from '../src/utils/topic-last-message';

type PreviewMessage = {
  id: string;
  text: string;
};

const preview = (id: string): PreviewMessage => ({ id, text: id });

test.describe('превью после удаления сообщения', () => {
  test('не считает незагруженную локальную историю пустой', () => {
    const serverLastMessage = preview('server-last');

    expect(
      resolveLastMessageAfterLocalSync(serverLastMessage, undefined, false)
    ).toBe(serverLastMessage);
  });

  test('показывает предыдущее сообщение из известной локальной истории', () => {
    const localLastMessage = preview('local-last');

    expect(
      resolveLastMessageAfterLocalSync(
        preview('server-last'),
        localLastMessage,
        true
      )
    ).toBe(localLastMessage);
  });

  test('очищает превью, когда известная локальная история пуста', () => {
    expect(
      resolveLastMessageAfterLocalSync(preview('server-last'), undefined, true)
    ).toBeUndefined();
  });
});
