import { CbEvents, getSDK } from '@openim/wasm-client-sdk';

import { ref } from 'vue';
import {
  setAllNotificationCount,
  updateConversationList
} from './useConversions';
import { updateGroupList } from './useGroup';
import {
  generateConversationId,
  processIncomingMessage,
  Message as ProcessedMessage
} from '../utils/messageProcessor';
import type { OpenIMMessage } from '../types/messages';
import { generateUUID } from '../utils/generateUUID';

export type IMSDKType = ReturnType<typeof getSDK>;

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

if (import.meta.hot) {
  import.meta.hot.accept(() => {});

  import.meta.hot.dispose(() => {});
}

const setupOpenIM = (): void => {
  IMSDK.on(CbEvents.OnConnecting, () => {});

  IMSDK.on(CbEvents.OnConnectSuccess, () => {});

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

      let list: ProcessedMessage[] = [];

      if (Array.isArray(payload)) {
        list = payload as ProcessedMessage[];
      } else if (
        (payload as any)?.messageList &&
        Array.isArray((payload as any).messageList)
      ) {
        list = (payload as any).messageList;
      } else {
        list = [payload as ProcessedMessage];
      }

      if (!Array.isArray(list)) {
        console.warn('[OpenIM] Unexpected message format:', payload);
        return;
      }

      let enableAudio = false;
      list.forEach((message: ProcessedMessage) => {
        if (!message) return;

        const processedMessage = processIncomingMessage(message);
        if (!processedMessage) {
          return;
        }

        if (!enableAudio) {
          enableAudio = !processedMessage.notificationElem;
        }

        const convId = generateConversationId(processedMessage);
        appendMessageToLocal(convId, processedMessage as OpenIMMessage);
      });

      if (enableAudio) {
        new Audio('/audio/new-message.mp3').play().catch(e => {
          console.error('Failed to play notification sound:', e);
        });
      }
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
  const clientUUID = generateUUID();

  try {
    const res = await IMSDK.uploadFile({
      name: clientUUID + '_' + file.name,
      contentType: file.type,
      uuid: clientUUID,
      file: file
    });

    return encodeURI(res.data.url);
  } catch (error) {
    const errorDetails = {
      error: error,
      operation: 'uploadFile',
      fileName: file.name,
      fileSize: file.size,
      timestamp: new Date().toISOString(),
      operationID: error?.operationID || error?.data?.operationID || null,
      event: error?.event || error?.data?.event || null,
      errorMessage: error?.errorMessage || error?.message || 'Unknown error'
    };

    console.error('[OpenIM] Failed to upload file:', errorDetails);

    if (error?.operationID) {
      console.info(`Operation ID: ${error.operationID}`);
    }
    if (error?.event) {
      console.info(`Event: ${error.event}`);
    }

    throw error;
  }
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
  const clientMsgID = generateUUID();

  if (!to && !groupId) {
    const error = new Error(
      'Either "to" (for individual chat) or "groupId" (for group chat) must be provided'
    );
    const errorDetails = {
      error: error,
      operation: 'sendMessage',
      to,
      groupId,
      message: message || '',
      type,
      timestamp: new Date().toISOString(),
      errorMessage: error.message
    };

    console.error(
      '[OpenIM] Cannot send message: invalid parameters:',
      errorDetails
    );
    throw error;
  }

  try {
    let createResp: any;

    if (type === 'text') {
      try {
        createResp = await IMSDK.createTextMessage(message || '');
      } catch (error) {
        const errorDetails = {
          error: error,
          operation: 'createTextMessage',
          message: message || '',
          timestamp: new Date().toISOString(),
          operationID: error?.operationID || error?.data?.operationID || null,
          event: error?.event || error?.data?.event || null,
          errorMessage: error?.errorMessage || error?.message || 'Unknown error'
        };

        console.error('[OpenIM] Failed to create text message:', errorDetails);

        if (error?.operationID) {
          console.info(`Operation ID: ${error.operationID}`);
        }
        if (error?.event) {
          console.info(`Event: ${error.event}`);
        }

        throw error;
      }
    } else if (type === 'file') {
      if (!file) throw new Error('File is required for file message');

      try {
        createResp = await IMSDK.createFileMessageByFile({
          filePath: file.name,
          fileName: file.name,
          uuid: generateUUID(),
          sourceUrl: '',
          fileSize: file.size,
          fileType: file.type,
          file: file
        });
      } catch (error) {
        const errorDetails = {
          error: error,
          operation: 'createFileMessageByFile',
          fileName: file.name,
          fileSize: file.size,
          timestamp: new Date().toISOString(),
          operationID: error?.operationID || error?.data?.operationID || null,
          event: error?.event || error?.data?.event || null,
          errorMessage: error?.errorMessage || error?.message || 'Unknown error'
        };

        console.error('[OpenIM] Failed to create file message:', errorDetails);

        if (error?.operationID) {
          console.info(`Operation ID: ${error.operationID}`);
        }
        if (error?.event) {
          console.info(`Event: ${error.event}`);
        }

        throw error;
      }
    } else if (type === 'image') {
      if (!file) throw new Error('File is required for image message');

      const picBaseInfo = {
        uuid: generateUUID(),
        type: file.type,
        size: file.size,
        width: 300,
        height: 215,
        url: ''
      };

      try {
        createResp = await IMSDK.createImageMessageByFile({
          sourcePicture: picBaseInfo,
          bigPicture: picBaseInfo,
          snapshotPicture: picBaseInfo,
          sourcePath: file.name,
          file: file
        });
      } catch (error) {
        const errorDetails = {
          error: error,
          operation: 'createImageMessageByFile',
          fileName: file.name,
          fileSize: file.size,
          timestamp: new Date().toISOString(),
          operationID: error?.operationID || error?.data?.operationID || null,
          event: error?.event || error?.data?.event || null,
          errorMessage: error?.errorMessage || error?.message || 'Unknown error'
        };

        console.error('[OpenIM] Failed to create image message:', errorDetails);

        if (error?.operationID) {
          console.info(`Operation ID: ${error.operationID}`);
        }
        if (error?.event) {
          console.info(`Event: ${error.event}`);
        }

        throw error;
      }
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
    const errorDetails = {
      error: error,
      operation: 'sendMessage',
      to,
      groupId,
      timestamp: new Date().toISOString(),
      operationID: error?.operationID || error?.data?.operationID || null,
      event: error?.event || error?.data?.event || null,
      errorMessage: error?.errorMessage || error?.message || 'Unknown error'
    };

    console.error('[OpenIM] Failed to send message:', errorDetails);

    if (error?.operationID) {
      console.info(`Operation ID: ${error.operationID}`);
    }
    if (error?.event) {
      console.info(`Event: ${error.event}`);
    }

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
      count: 50,
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
    const errorDetails = {
      error: err,
      operation: 'getAdvancedHistoryMessageList',
      conversationID: conversationId,
      startClientMsgID: lastClientMsgID,
      timestamp: new Date().toISOString(),
      operationID: err?.operationID || err?.data?.operationID || null,
      event: err?.event || err?.data?.event || null,
      errorMessage: err?.errorMessage || err?.message || 'Unknown error'
    };

    console.error('Failed to get messages for conversation:', errorDetails);

    if (err?.operationID) {
      console.info(`Operation ID: ${err.operationID}`);
    }
    if (err?.event) {
      console.info(`Event: ${err.event}`);
    }

    return [];
  }
};

const markAsRead = async (conversationID: string) => {
  await IMSDK.markConversationMessageAsRead(conversationID);
};

const messagesStore = ref<Record<string, OpenIMMessage[]>>({});

const saveMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  messagesStore.value[conversationId] = messages;
};

const getSavedMessages = (conversationId: string): OpenIMMessage[] => {
  return messagesStore.value[conversationId] || [];
};

const appendMessageToLocal = (
  conversationId: string,
  message: OpenIMMessage
): void => {
  const arr = messagesStore.value[conversationId] || [];
  arr.push(message);
  messagesStore.value[conversationId] = arr;
};

const appendOldMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  const arr = messagesStore.value[conversationId] || [];
  arr.unshift(...messages);
  messagesStore.value[conversationId] = arr;
};

export {
  IMSDK,
  getOrGeneratePlatformId,
  setupOpenIM,
  getMessagesByConversationId,
  saveMessagesToLocal,
  getSavedMessages,
  appendMessageToLocal,
  markAsRead
};
