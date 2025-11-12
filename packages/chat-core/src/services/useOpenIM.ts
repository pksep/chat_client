import { CbEvents, getSDK } from '@openim/wasm-client-sdk';

export interface IConversation {
  id: string;
  userId: string;
  title: string;
  imageURL: string;
  isPin: boolean;
  nickname: string;
  latestMessage: string;
  notificationCount: boolean;
}

const IMSDK = getSDK();

const setupOpenIM = (): void => {
  IMSDK.on(CbEvents.OnConnecting, () => {
    console.debug('[OpenIM] Connecting...');
  });

  IMSDK.on(CbEvents.OnConnectSuccess, () => {
    console.debug('[OpenIM] Connected successfully!');
  });

  IMSDK.on(CbEvents.OnConnectFailed, err => {
    console.error('[OpenIM] Connection failed:', err);
  });
};

export const sendMessageIM = async ({
  to,
  message,
  groupId
}: {
  to: string;
  message: string;
  groupId: string;
}): Promise<void> => {
  const clientMsgID = crypto.randomUUID().toString();

  try {
    const createResponse = await IMSDK.createTextMessage(message);
    const textMessage = createResponse.data;
    textMessage.clientMsgID = clientMsgID;

    await IMSDK.sendMessage({
      message: textMessage,
      recvID: to,
      groupID: groupId
    });
    console.debug('[OpenIM] Message sent successfully to:', to);
  } catch (error) {
    console.error('[OpenIM] Failed to send message:', error);
    throw error;
  }
};

const getOrGeneratePlatformId = (): number => {
  const key = 'platformId';
  const storedId = sessionStorage.getItem(key);
  if (storedId === null) {
    const newId = Math.floor(Math.random() * 9) + 1;
    sessionStorage.setItem(key, newId.toString());
    return newId;
  } else {
    return parseInt(storedId, 10);
  }
};

const getConversationList = async (): Promise<IConversation[]> => {
  try {
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
        notificationCount: c.unreadCount > 0
      };
    });

    return conversations;
  } catch (err) {
    console.error('Failed to get users with messages:', err);
    return [];
  }
};

export { IMSDK, setupOpenIM, getOrGeneratePlatformId, getConversationList };
