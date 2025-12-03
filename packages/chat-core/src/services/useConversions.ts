import { CbEvents, ConversationItem } from '@openim/wasm-client-sdk';
import { ref } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps } from '../components/interfaces/interfaces';
import { setGroupList } from './useGroup';
import { getUsersList } from '../composables/useUsers';
import { updateItemList } from '../utils/listUtils';

const conversionStore = ref<IContactProps[]>([]);
const allNotificationCount = ref<number>(0);

const fetchConversationList = async () => {
  try {
    const response = await IMSDK.getAllConversationList();

    const result = response.data || [];

    if (!Array.isArray(result)) {
      console.warn('Conversation list response is not an array:', result);
      return;
    }

    const totalUnread = result.reduce(
      (sum, conv) => sum + (conv.unreadCount || 0),
      0
    );

    setAllNotificationCount(totalUnread);
    setConversationList(result.filter(item => !item.groupID));
    setGroupList(result.filter(item => !!item.groupID));
  } catch (err) {
    console.error('Failed to get users with messages:', err);
    // Don't throw error to prevent breaking the UI
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

// Helper function to safely parse message JSON
const parseMessage = (messageStr: string | undefined) => {
  if (!messageStr) return null;
  try {
    return JSON.parse(messageStr);
  } catch (error) {
    console.error('Failed to parse message JSON:', error);
    return null;
  }
};

export const manipulateConversationList = (
  conversations: Partial<ConversationItem>[]
): IContactProps[] => {
  const users = getUsersList();

  return conversations.map(c => {
    const user = users.find(user => user.id === c.userID);
    const parsedMsg = c.latestMsg ? parseMessage(c.latestMsg) : null;

    return {
      id: c.conversationID,
      userId: c.userID,
      nickname: c.showName,
      avatarUrl: c.faceURL,
      isPin: c.isPinned,
      tabel: user?.tabel || '',
      initial: user?.initial || '',
      latestMessage: parsedMsg
        ? parsedMsg.textElem?.content ||
          parsedMsg.fileElem?.fileName ||
          parsedMsg.pictureElem?.sourcePath ||
          ''
        : '',
      latestMessageTime:
        c.latestMsgSendTime ||
        (parsedMsg ? parsedMsg.sendTime || '' : ''),
      notificationCount: c.unreadCount,
      groupId: c.groupID,
      isRead: parsedMsg
        ? parsedMsg.isRead && c.userID !== parsedMsg.sendID
        : false
    };
  });
};

const getConversationList = (): IContactProps[] => {
  return conversionStore.value || [];
};

const setConversationList = (value: ConversationItem[]): void => {
  conversionStore.value = manipulateConversationList(value);
};

const updateConversationList = (value: any[]): void => {
  const newItems = manipulateConversationList(value);
  conversionStore.value = updateItemList(conversionStore.value, newItems);
};

const getAllNotificationCount = (): number => {
  return allNotificationCount.value || 0;
};

const setAllNotificationCount = (value: number): void => {
  allNotificationCount.value = value;
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
  getOneConversation,
  getAllNotificationCount,
  setAllNotificationCount
};
