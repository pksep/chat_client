import { CbEvents, getSDK } from '@openim/wasm-client-sdk';
import { ref } from 'vue';

export interface IConversation {
  id: string;
  userId: string;
  title: string;
  imageURL: string;
  isPin: boolean;
  nickname: string;
  latestMessage: string;
  notificationCount: number;
}

const IMSDK = getSDK({ debug: false });

const conversionStore = ref<IConversation[]>([]);

const fetchConversationList = async () => {
  try {
    IMSDK.on(CbEvents.OnConnecting, async () => {
      const response = await IMSDK.getAllConversationList();

      const result = response.data || [];

      const conversations = result.map(c => {
        return {
          id: c.conversationID,
          userId: c.userID,
          title: c.showName,
          imageURL: c.faceURL,
          isPin: c.isPinned,
          nickname: c.showName,
          latestMessage: JSON.parse(c.latestMsg)?.textElem?.content || '',
          latestMessageTime: JSON.parse(c.latestMsg)?.sendTime || '',
          notificationCount: c.unreadCount
        };
      });

      conversionStore.value = conversations;
    });
  } catch (err) {
    console.error('Failed to get users with messages:', err);
  }
};

const getConversationList = (): any[] => {
  return conversionStore.value || [];
};

export { IMSDK, fetchConversationList, getConversationList };
