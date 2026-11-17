import { afterAll, expect, mock, test } from 'bun:test';
import type { ITopic } from '../src/components/interfaces/interfaces';

mock.module('../src/composables/navigation/useUrlRouting', () => ({
  navigateToDialogs: (): void => {},
  navigateToGroup: (): void => {}
}));
const { openMessageDraft, consumePendingMessageDraft, takeAiForwardSource } =
  await import('../src/composables/useMessageDraftTransfer');
const topic = { id: 'topic', type: 'DM' } as ITopic;
const source = {
  threadId: '65386e9-4638-4c15-8167-b8c05ff4023a',
  ownerId: 'owner',
  organizationId: 'company'
};
const text = 'Переслано из ИИ-Ассистента\nСЭПи:\nОтвет';
afterAll((): void => mock.restore());

test('источник доходит до отправки после переноса текста в редактор', (): void => {
  openMessageDraft(topic, text, source);
  expect(consumePendingMessageDraft(topic.id)).toBe(text);
  expect(takeAiForwardSource(topic.id, text.replace(/\n/g, ' '))).toEqual(
    source
  );
  expect(takeAiForwardSource(topic.id, text)).toBeNull();
});

test('обычное сообщение и другой получатель не наследуют прежний источник', (): void => {
  openMessageDraft(topic, text, source);
  consumePendingMessageDraft(topic.id);
  expect(takeAiForwardSource('other-topic', text)).toBeNull();
  expect(takeAiForwardSource(topic.id, 'Другое сообщение')).toBeNull();
  expect(takeAiForwardSource(topic.id, text)).toBeNull();
  openMessageDraft(topic, text, source);
  openMessageDraft(topic, text);
  expect(takeAiForwardSource(topic.id, text)).toBeNull();
});
