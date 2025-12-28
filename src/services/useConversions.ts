import { ConversationItem } from '@openim/wasm-client-sdk';
import { ref, shallowRef } from 'vue';
import { IMSDK } from './useOpenIM';
import { IContactProps } from '../components/interfaces/interfaces';
import { setGroupList } from './useGroup';
import { getUsersList } from '../composables/useUsers';
import { updateItemList } from '../utils/listUtils';

const conversionStore = shallowRef<IContactProps[]>([]);
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

const fetchConversationList = async () => {
  if (!isSDKReady) {
    console.debug('SDK not ready yet, skipping conversation list fetch');
    return;
  }

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
    const errorDetails = {
      error: err,
      operation: 'getAllConversationList',
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to get conversation list:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }
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
    const errorDetails = {
      error: err,
      operation: 'setConversation',
      conversationID,
      isPinned,
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to pin/unpin conversation:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }
  }
};

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

  // Use Map for faster user lookup
  const userMap = new Map(users.map(user => [user.id, user]));
  // Get current user to determine if latest message was sent by them
  const currentUser = JSON.parse(sessionStorage.getItem('openim_user') || '{}');
  const currentUserId = currentUser?.userID;

  return conversations.map(c => {
    const user = userMap.get(c.userID);
    const parsedMsg = c.latestMsg ? parseMessage(c.latestMsg) : null;

    return {
      id: c.conversationID,
      conversationId: c.conversationID, // Add the conversationId field
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
        c.latestMsgSendTime || (parsedMsg ? parsedMsg.sendTime || '' : ''),
      notificationCount: c.unreadCount,
      groupId: c.groupID,
      isRead: parsedMsg
        ? parsedMsg.isRead && c.userID !== parsedMsg.sendID
        : false,
      latestMessageStatus: parsedMsg?.status, // Add message status
      isLatestMessageFromMe: parsedMsg?.sendID === currentUserId // Check if message was sent by current user
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

/**
 * Updates specific columns/properties of a conversation record
 * @param conversationID The ID of the conversation to update
 * @param updates Object containing the properties to update
 */
const updateColumnsConversation = (
  conversationID: string,
  updates: Partial<IContactProps>
): void => {
  const index = conversionStore.value.findIndex(
    conv => conv.id === conversationID
  );
  if (index !== -1) {
    // Create a new array to ensure reactivity
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
    const errorDetails = {
      error: err,
      operation: 'getOneConversation',
      sourceID,
      sessionType,
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to get one conversation:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }

    throw err;
  }
};

export {
  fetchConversationList,
  getConversationList,
  setConversationList,
  updateConversationList,
  updateColumnsConversation,
  setPinConversation,
  getOneConversation,
  getAllNotificationCount,
  setAllNotificationCount
};
