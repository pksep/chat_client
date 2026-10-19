import { getChatSDK } from '../services/useChat';
import { deleteTopicFromList } from './useTopics';

/** Список меняется только после подтверждённого удаления, серверная история сохраняется. */
export async function deleteClientChat(topicId: string): Promise<void> {
  const sdk = getChatSDK();

  if (!sdk) throw new Error('Чат ещё не подключён');

  await sdk.deleteTopic(topicId);

  deleteTopicFromList(topicId);
}
