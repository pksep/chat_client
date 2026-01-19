import { ref, shallowRef } from 'vue';
import { getChatSDK, getCurrentUserId } from './useChat';
import { ITopic } from '../components/interfaces/interfaces';
import { getUsersList } from '../composables/useUsers';
import { updateItemList } from '../utils/listUtils';
import { MessageStatus } from './useChatSDK/types';

enum TopicType {
  Group = 'GROUP',
  DM = 'DM'
}

const conversionStore = shallowRef<ITopic[]>([]);
const allNotificationCount = ref<number>(0);

let isSDKReady = false;

const sdkReadyCallbacks: Array<() => void> = [];

export const markSDKReady = () => {
  isSDKReady = true;

  sdkReadyCallbacks.forEach(callback => {
    try {
      callback();
    } catch (error) {
      console.error('Error in SDK ready callback:', error);
    }
  });

  sdkReadyCallbacks.length = 0;
};

export const onSDKReady = (callback: () => void) => {
  if (isSDKReady) {
    callback();
  } else {
    sdkReadyCallbacks.push(callback);
  }
};

const resolveParticipants = (topic: any) => {
  return topic.members || [];
};

const resolveTopicMeta = (topic: any) => {
  const group = topic.group || topic.groupInfo || null;
  const title = topic.title || group?.title || group?.groupName || '';
  const avatarUrl = topic.avatarUrl || group?.avatarUrl || group?.faceURL || '';
  const groupId =
    topic.groupId ||
    group?.id ||
    group?.groupID ||
    (topic.type === TopicType.Group ? topic.id : undefined);

  return { title, avatarUrl, groupId };
};

const parseLastMessagePreview = (lastMessage: any): string => {
  if (!lastMessage) return '';
  if (lastMessage.text) return lastMessage.text;
  const firstMedia = lastMessage.media?.[0];
  return firstMedia?.fileName || firstMedia?.path || '';
};

export const manipulateConversationList = (topics: any[]): any[] => {
  const users = getUsersList();
  const userMap = new Map(users.map(user => [user.id, user]));
  const currentUserId = getCurrentUserId();

  return topics.map(topic => {
    const { title, avatarUrl, groupId } = resolveTopicMeta(topic);
    const participants = resolveParticipants(topic);

    const otherUser =
      participants.find((user: any) => user.id !== currentUserId) ||
      participants[0];
    const user = otherUser ? userMap.get(otherUser.id) : null;
    const lastMessage = topic.lastMessage;
    const contactId =
      topic.type === TopicType.Group
        ? groupId || topic.id
        : otherUser?.id || topic.id;

    const nickname =
      topic.type === TopicType.DM
        ? user?.nickname || otherUser?.nickname || title
        : title;
    const contactAvatarUrl =
      topic.type === TopicType.DM
        ? user?.avatarUrl || otherUser?.avatarUrl || ''
        : avatarUrl;
    const initials = user?.initials || otherUser?.initials || nickname;

    const contactUser =
      topic.type === TopicType.Group
        ? {
            id: topic.id,
            initials: title || `Group ${topic.id.substring(0, 8)}`,
            nickname: title || `Group ${topic.id.substring(0, 8)}`,
            avatarUrl: avatarUrl || ''
          }
        : {
            id: otherUser?.id || contactId,
            initials,
            nickname,
            avatarUrl: contactAvatarUrl
          };

    return {
      id: contactId,
      userId: topic.type === TopicType.DM ? otherUser?.id : undefined,
      nickname,
      avatarUrl: contactAvatarUrl,

      user: contactUser,
      isPin:
        topic.isPin || topic.isPinned || topic.topicSetting?.isPin || false,
      initial: '',
      latestMessage: parseLastMessagePreview(lastMessage),
      latestMessageTime: lastMessage?.createdAt
        ? new Date(lastMessage.createdAt).getTime()
        : undefined,
      notificationCount: topic.unreadCount || 0,
      groupId,
      isRead: lastMessage?.status === MessageStatus.Read,
      latestMessageStatus: lastMessage?.status,
      isLatestMessageFromMe: lastMessage?.senderUserId === currentUserId,
      topicId: topic.type === TopicType.Group ? groupId || topic.id : topic.id
    };
  });
};

const fetchConversationList = async () => {};

const getConversationList = (): ITopic[] => {
  return conversionStore.value || [];
};

const setConversationList = (value: any[]): void => {
  conversionStore.value = manipulateConversationList(value);
};

const updateConversationList = (value: any[]): void => {
  const newItems = manipulateConversationList(value);
  conversionStore.value = updateItemList(conversionStore.value, newItems);
};

const updateColumnsConversation = (
  conversationID: string,
  updates: Partial<ITopic>
): void => {
  const index = conversionStore.value.findIndex(
    conv => conv.id === conversationID
  );
  if (index !== -1) {
    const updatedConversations = [...conversionStore.value];
    updatedConversations[index] = {
      ...updatedConversations[index],
      ...updates
    };
    conversionStore.value = updatedConversations;
  } else {
    console.warn(`Conversation with ID ${conversationID} not found for update`);
  }
};

const getAllNotificationCount = (): number => {
  return allNotificationCount.value || 0;
};

const setAllNotificationCount = (value: number): void => {
  allNotificationCount.value = value;
};

const getOneConversation = async (topicId: string): Promise<ITopic | null> => {
  try {
    const sdk = getChatSDK();
    const response = await sdk.getTopics();
    const topic = response.data.find((item: any) => item.id === topicId);
    if (!topic) return null;
    return manipulateConversationList([topic])[0] || null;
  } catch (err) {
    console.error('Failed to get one topic:', err);
    return null;
  }
};

export {
  fetchConversationList,
  getConversationList,
  setConversationList,
  updateConversationList,
  updateColumnsConversation,
  getOneConversation,
  getAllNotificationCount,
  setAllNotificationCount
};
