import { CbEvents, getSDK } from '@openim/wasm-client-sdk';

import { ref } from 'vue';
import {
  setAllNotificationCount,
  updateConversationList
} from './useConversions';
import { updateGroupList } from './useGroup';
import { generateConversationId, processIncomingMessage, Message } from '../utils/messageProcessor';

export type IMSDKType = ReturnType<typeof getSDK>;

// Храним единственный экземпляр
// Экспортируем singleton IMSDK

let instance: IMSDKType | null = null;

const IMSDK: IMSDKType = (() => {
  if (!instance) {
    instance = getSDK({
      debug: false,
      coreWasmPath: '/openIM.wasm',
      sqlWasmPath: '/sql-wasm.wasm'
    });
  }
  return instance;
})();

// Защита от дубликатов при Hot Module Reload (Vite)
// Не уничтожаем wasm при dispose — иначе SDK ломается

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // console.log('[IMSDK] HMR: module hot reloaded (singleton preserved)');
  });

  import.meta.hot.dispose(() => {
    // console.log('[IMSDK] HMR: dispose — SKIPPED (do not reset instance)');
  });
}

const setupOpenIM = (): void => {
  IMSDK.on(CbEvents.OnConnecting, () => {
    // console.debug('[OpenIM] Connecting...');
  });

  IMSDK.on(CbEvents.OnConnectSuccess, () => {
    // console.debug('[OpenIM] Connected successfully!');
  });

  IMSDK.on(CbEvents.OnConnectFailed, err => {
    console.error('[OpenIM] Connection failed:', err);
  });

  IMSDK.on(CbEvents.OnTotalUnreadMessageCountChanged, ev => {
    const count = ev.data;
    setAllNotificationCount(count);
  });

  IMSDK.on(CbEvents.OnConversationChanged, ev => {
    const data = ev.data || [];
    updateConversationList(data.filter(item => !item.groupID));
    updateGroupList(data.filter(item => !!item.groupID));
  });

  IMSDK.on(CbEvents.OnRecvNewMessages, evt => {
    try {
      const payload = evt?.data;
      if (!payload) return;

      let list: Message[] = [];

      if (Array.isArray(payload)) {
        list = payload as Message[];
      } else if ((payload as any)?.messageList && Array.isArray((payload as any).messageList)) {
        list = (payload as any).messageList;
      } else {
        list = [payload as Message];
      }

      if (!Array.isArray(list)) {
        console.warn('[OpenIM] Unexpected message format:', payload);
        return;
      }

      list.forEach((message: Message) => {
        // Process the message and check if we should skip it
        if (!message) return;

        const processedMessage = processIncomingMessage(message);
        if (!processedMessage) {
          return; // Skip this message
        }

        // Generate conversation ID and store the message
        const convId = generateConversationId(processedMessage);
        appendMessageToLocal(convId, processedMessage);
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

  return encodeURI(res.data.url);
};

export const sendMessageIM = async ({
  to,
  groupId,
  message,
  type = 'text',
  file
}: {
  to: string;
  groupId: string;
  message?: string;
  type?: 'text' | 'file' | 'image';
  file?: File;
}): Promise<void> => {
  const clientMsgID = crypto.randomUUID();

  try {
    let createResp: any;

    if (type === 'text') {
      createResp = await IMSDK.createTextMessage(message || '');
    } else if (type === 'file') {
      if (!file) throw new Error('File is required for file message');

      // Используем createFileMessageByFile
      createResp = await IMSDK.createFileMessageByFile({
        filePath: file.name, // можно использовать имя файла
        fileName: file.name,
        uuid: crypto.randomUUID(),
        sourceUrl: '', // можно пустой, если нет заранее загруженного URL
        fileSize: file.size,
        fileType: file.type,
        file: file
      });
    } else if (type === 'image') {
      if (!file) throw new Error('File is required for image message');

      // Подготавливаем данные PicBaseInfo
      const picBaseInfo = {
        uuid: crypto.randomUUID(),
        type: file.type,
        size: file.size,
        width: 300, // можно определить, если нужно
        height: 215,
        url: '' // при отправке файла URL может быть пустой
      };

      createResp = await IMSDK.createImageMessageByFile({
        sourcePicture: picBaseInfo,
        bigPicture: picBaseInfo,
        snapshotPicture: picBaseInfo,
        sourcePath: file.name, // или другой путь, если есть
        file: file
      });
    } else {
      throw new Error('Unsupported message type');
    }

    const msg = createResp.data;
    if (!msg) throw new Error('Failed to create message');

    msg.clientMsgID = clientMsgID;

    const res = await IMSDK.sendMessage({
      message: msg,
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
