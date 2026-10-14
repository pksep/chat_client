import type { IMessage } from '../components/interfaces/interfaces';

/** Отличает обращение от обычной группы до загрузки списка сервиса клиентов. */
export function hasInquiryTopicMarker(
  topic?: { group?: { description?: string } } | null
): boolean {
  return topic?.group?.description === 'sep-chat:external-inquiry:v1';
}

/** Старый локальный кэш не возвращает события состава группы в переписку клиента. */
export function visibleInquiryMessages(
  messages: IMessage[],
  isInquiryTopic: (topicId: string) => boolean
): IMessage[] {
  return messages.filter(
    message => !message.isSystem || !isInquiryTopic(message.topicId)
  );
}
