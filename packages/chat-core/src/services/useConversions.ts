import { CbEvents } from '@openim/wasm-client-sdk';
import { ref } from 'vue';
import { IMSDK } from './useOpenIM';

export interface IConversation {
  id: string;
  userId: string;
  title: string;
  imageURL: string;
  isPin: boolean;
  nickname: string;
  latestMessage: string;
  latestMessageTime: number;
  notificationCount: number;
  isRead: boolean;
}

const conversionStore = ref<IConversation[]>([]);

const fetchConversationList = async () => {
  try {
    IMSDK.on(CbEvents.OnConnecting, async () => {
      const response = await IMSDK.getAllConversationList();

      const result = response.data || [];

      setConversationList(result);
    });
  } catch (err) {
    console.error('Failed to get users with messages:', err);
  }
};

const manipulateConversationList = conversations => {
  return conversations.map(c => {
    return {
      id: c.conversationID,
      userId: c.userID,
      title: c.showName,
      imageURL: c.faceURL,
      isPin: c.isPinned,
      nickname: c.showName,
      latestMessage: JSON.parse(c.latestMsg)?.textElem?.content || '',
      latestMessageTime: JSON.parse(c.latestMsg)?.sendTime || '',
      notificationCount: c.unreadCount,
      isRead:
        JSON.parse(c.latestMsg)?.isRead &&
        c.userID !== JSON.parse(c.latestMsg)?.sendID
    };
  });
};

const getConversationList = (): IConversation[] => {
  return conversionStore.value || [];
};

const setConversationList = (value): void => {
  conversionStore.value = manipulateConversationList(value);
};

const updateConversationList = (value: any[]): void => {
  const newItems = manipulateConversationList(value);

  const conversationMap = new Map(
    conversionStore.value.map(item => [item.id, item])
  );

  newItems.forEach(item => {
    conversationMap.set(item.id, { ...conversationMap.get(item.id), ...item });
  });

  conversionStore.value = Array.from(conversationMap.values()).sort((a, b) => {
    return b.latestMessageTime - a.latestMessageTime;
  });
};

export {
  IMSDK,
  fetchConversationList,
  getConversationList,
  setConversationList,
  updateConversationList
};
