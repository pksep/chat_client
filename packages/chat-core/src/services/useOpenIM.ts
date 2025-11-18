import { CbEvents, getSDK } from '@openim/wasm-client-sdk';

import { ref } from 'vue';
import { updateConversationList } from './useConversions';
import { updateGroupList } from './useGroup';

type IMSDKType = ReturnType<typeof getSDK>;

const IMSDK: IMSDKType = getSDK({ debug: false });

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

  IMSDK.on(CbEvents.OnConversationChanged, err => {
    updateConversationList(err.data.filter(item => !item.groupID) || []);
    updateGroupList(err.data.filter(item => !!item.groupID) || []);
  });

  // check all events for debugging
  // Object.values(CbEvents).forEach(eventName => {
  //   IMSDK.on(eventName, (data: any) => {
  //     console.debug(`[OpenIM Event] ${eventName}:`, data);
  //   });
  // });

  IMSDK.on(CbEvents.OnRecvNewMessages, evt => {
    try {
      const payload = evt?.data as any;

      if (!payload) return;

      let list: any[] = [];

      if (Array.isArray(payload)) {
        list = payload;
      } else if (Array.isArray(payload.messageList)) {
        list = payload.messageList;
      } else {
        list = [payload];
      }

      list.forEach((m: any) => {
        const [smallerUserID, largerUserID] = [m.sendID, m.recvID].sort();

        const convId = m.groupID
          ? `sg_${m.groupID}`
          : `si_${smallerUserID}_${largerUserID}`;

        appendMessageToLocal(convId, m);
      });
    } catch (e) {
      console.error('[OpenIM] Failed to process incoming message event:', e);
    }
  });

  IMSDK.on(CbEvents.OnRecvC2CReadReceipt, evt => {
    const receipts = evt.data as any as Array<{
      conversationID: string;
      clientMsgID: string;
      readTime: number;
    }>;
    receipts.forEach(r => {
      // mark the message with clientMsgID in conversationID as “read by other”
      const msgs = getSavedMessages(r.conversationID);
      const idx = msgs.findIndex(m => m.clientMsgID === r.clientMsgID);
      if (idx >= 0) {
        msgs[idx].isReadByPeer = true;
        saveMessagesToLocal(r.conversationID, msgs);
      }
    });
  });
};

export const uploadFile = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  const clientUUID = crypto.randomUUID().toString();

  const res = await IMSDK.uploadFile({
    name: clientUUID + '_' + file.name,
    contentType: file.type,
    uuid: clientUUID,
    file: file
  });

  return res.data.url;
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

    const res = await IMSDK.sendMessage({
      message: textMessage,
      recvID: to,
      groupID: groupId
    });

    const [smallerUserID, largerUserID] = [
      res.data.sendID,
      res.data.recvID
    ].sort();

    const convId = !to
      ? `sg_${groupId}`
      : `si_${smallerUserID}_${largerUserID}`;

    appendMessageToLocal(convId, res.data);

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

const getMessagesByConversationId = async (
  conversationId: string,
  lastClientMsgID: string = ''
): Promise<any[]> => {
  try {
    const response = await IMSDK.getAdvancedHistoryMessageList({
      conversationID: conversationId,
      startClientMsgID: lastClientMsgID,
      count: 10,
      viewType: 0
    });

    const messages = response.data.messageList || [];
    if (lastClientMsgID) {
      appendOldMessagesToLocal(conversationId, messages);
    } else {
      saveMessagesToLocal(conversationId, messages);
    }

    return messages;
  } catch (err) {
    console.error('Failed to get messages for conversation:', err);
    return [];
  }
};

// When current user reads a chat
const markAsRead = async (conversationID: string) => {
  await IMSDK.markConversationMessageAsRead(conversationID);
};

// In-module reactive "store" — no extra files
const messagesStore = ref<Record<string, any[]>>({});

const saveMessagesToLocal = (conversationId: string, messages: any[]): void => {
  messagesStore.value[conversationId] = messages;
};

const getSavedMessages = (conversationId: string): any[] => {
  return messagesStore.value[conversationId] || [];
};

const appendMessageToLocal = (conversationId: string, message: any): void => {
  const arr = messagesStore.value[conversationId] || [];
  arr.push(message);
  messagesStore.value[conversationId] = arr;
};

const appendOldMessagesToLocal = (conversationId: string, messages): void => {
  const arr = messagesStore.value[conversationId] || [];
  arr.unshift(...messages);
  messagesStore.value[conversationId] = arr;
};

export {
  IMSDK,
  setupOpenIM,
  getOrGeneratePlatformId,
  getMessagesByConversationId,
  saveMessagesToLocal,
  getSavedMessages,
  appendMessageToLocal,
  markAsRead
};
