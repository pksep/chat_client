import { CbEvents } from '@openim/wasm-client-sdk';
import { ref } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps } from '../components/interfaces/interfaces';
import { setGroupList } from './useGroup';

const conversionStore = ref<IContactProps[]>([]);

const fetchConversationList = async () => {
  try {
    IMSDK.on(CbEvents.OnConnecting, async () => {
      const response = await IMSDK.getAllConversationList();

      const result = response.data || [];

      setConversationList(result.filter(item => !item.groupID));
      setGroupList(result.filter(item => !!item.groupID));
    });
  } catch (err) {
    console.error('Failed to get users with messages:', err);
  }
};

const setPinConversation = async (
  conversationID: string,
  isPinned: boolean
) => {
  try {
    await IMSDK.setConversation({
      conversationID,
      isPinned
    });
  } catch (err) {
    console.error('Failed to get users with messages:', err);
  }
};

export const manipulateConversationList = conversations => {
  return conversations.map(c => {
    return {
      id: c.conversationID,
      userId: c.userID,
      name: c.showName,
      avatarUrl: c.faceURL,
      isPin: c.isPinned,
      nickname: c.ex,
      latestMessage: c.latestMsg
        ? JSON.parse(c.latestMsg)?.textElem?.content || ''
        : '',
      latestMessageTime:
        c.createdTime ||
        (c.latestMsg ? JSON.parse(c.latestMsg)?.sendTime || '' : ''),
      notificationCount: c.unreadCount,
      groupId: c.groupID,
      isRead: c.latestMsg
        ? JSON.parse(c.latestMsg)?.isRead &&
          c.userID !== JSON.parse(c.latestMsg)?.sendID
        : false
    };
  });
};

const getConversationList = (): IContactProps[] => {
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
    if (a.isPin && !b.isPin) return -1;
    if (!a.isPin && b.isPin) return 1;

    return b.latestMessageTime - a.latestMessageTime;
  });
};

const getOneConversation = async (
  sourceID: string,
  sessionType: number
): Promise<any> => {
  try {
    const response = await IMSDK.getOneConversation({
      sourceID,
      sessionType
    });

    return response.data;
  } catch (err) {
    console.error('Failed to get conversation:', err);
    throw err;
  }
};

export {
  fetchConversationList,
  getConversationList,
  setConversationList,
  updateConversationList,
  setPinConversation,
  getOneConversation
};
