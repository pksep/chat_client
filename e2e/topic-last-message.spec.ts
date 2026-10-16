import { expect, test } from '@playwright/test';
import {
  resolveLastMessageAfterLocalSync,
  resolveLastMessageStatus,
  resolveTopicLastMessage
} from '../src/utils/topic-last-message';
import { MessageStatus } from '../src/services/useChatSDK/types';

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

test.describe('статус последнего сообщения', () => {
  const message = (status: MessageStatus, id = 'last') => ({
    id,
    status,
    createdAt: new Date('2026-10-15T10:00:00Z'),
    text: 'Последнее сообщение'
  });

  for (const [confirmed, stale] of [
    [MessageStatus.Delivery, MessageStatus.Wait],
    [MessageStatus.Delivery, MessageStatus.NotDelivered],
    [MessageStatus.Read, MessageStatus.Delivery],
    [MessageStatus.Read, MessageStatus.Wait]
  ]) {
    test(`${confirmed} сохраняется при устаревшем ${stale} в любом источнике`, () => {
      for (const [topic, local] of [
        [message(confirmed), message(stale)],
        [message(stale), message(confirmed)]
      ]) {
        expect(resolveLastMessageStatus(topic, local)).toBe(confirmed);
        expect(resolveTopicLastMessage(topic, local)?.status).toBe(confirmed);
        expect(
          resolveLastMessageAfterLocalSync(topic, local, true)?.status
        ).toBe(confirmed);
      }
    });
  }

  test('новое сообщение не наследует прочтение предыдущего', () => {
    const previous = message(MessageStatus.Read, 'previous');
    const pending = {
      ...message(MessageStatus.Wait, 'next'),
      createdAt: new Date('2026-10-15T10:01:00Z')
    };

    expect(resolveTopicLastMessage(previous, pending)).toBe(pending);
    expect(resolveLastMessageStatus(pending, previous)).toBe(
      MessageStatus.Wait
    );
  });

  test('ошибка и повторная отправка сохраняют локальный статус до подтверждения', () => {
    for (const [previous, next] of [
      [MessageStatus.Wait, MessageStatus.NotDelivered],
      [MessageStatus.NotDelivered, MessageStatus.Wait]
    ]) {
      const topic = message(previous);
      const local = message(next);
      expect(resolveLastMessageStatus(topic, local)).toBe(next);
      expect(resolveTopicLastMessage(topic, local)?.status).toBe(next);
      expect(resolveLastMessageAfterLocalSync(topic, local, true)?.status).toBe(
        next
      );
    }
  });

  test('сохранение подтверждённого статуса не теряет локальные изменения текста', () => {
    const edited = { ...message(MessageStatus.Delivery), text: 'Новый текст' };
    const result = resolveTopicLastMessage(message(MessageStatus.Read), edited);

    expect(result).toMatchObject({
      status: MessageStatus.Read,
      text: 'Новый текст'
    });
    expect(edited.status).toBe(MessageStatus.Delivery);
  });
});
