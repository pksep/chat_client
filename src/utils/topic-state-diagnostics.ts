import type { IMessage, ITopic } from '../components/interfaces/interfaces';
import { resolveLastMessageStatus } from './topic-last-message';

export const getTopicStateDiagnostic = (
  topic: ITopic | null | undefined,
  clientMessage: IMessage | null | undefined,
  userId?: string | null
) => {
  const last = topic?.lastMessage;
  const local = last?.id === clientMessage?.id ? clientMessage : undefined;
  const topicStatus = last?.status;
  const clientStatus = local?.status;
  return {
    topicId: topic?.id,
    lastMessageId: last?.id,
    topicStatus,
    clientStatus,
    displayedStatus: resolveLastMessageStatus(last, local),
    statusMismatch:
      !!topicStatus && !!clientStatus && topicStatus !== clientStatus,
    isOwnLastMessage: !!userId && last?.senderUserId === userId,
    lastMessageCreatedAt: last?.createdAt,
    topicIsReadByMe: last?.isReadByMe,
    clientIsReadByMe: local?.isReadByMe,
    unreadMessageCount: topic?.unreadMessageCount ?? 0,
    isMarkedUnread: !!topic?.info?.isMarkedUnread,
    hasUnreadReaction: !!topic?.hasUnreadReaction
  };
};
