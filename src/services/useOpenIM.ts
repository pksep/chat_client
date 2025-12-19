import { CbEvents, getSDK } from '@openim/wasm-client-sdk';

import { ref, shallowRef } from 'vue';
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

const isWebsocketConnecting = ref(false);

export const getIsWebsocketConnecting = () => isWebsocketConnecting.value;

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

let connectionRetries = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 3000;
let reconnectTimeout: number | null = null;

const setupOpenIM = (): void => {
  const debounce = (func: (...args: any[]) => any, wait: number) => {
    let timeout: number;
    return function executedFunction(...args: any[]) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait) as unknown as number;
    };
  };

  const debouncedSetConnecting = debounce((val: boolean) => {
    isWebsocketConnecting.value = val;
  }, 300);

  IMSDK.on(CbEvents.OnConnecting, () => {
    console.log('[OpenIM] Connecting...');
    debouncedSetConnecting(true);
  });

  let connectionSuccessTimer: number | null = null;

  IMSDK.on(CbEvents.OnConnectSuccess, () => {
    console.log('[OpenIM] Connection successful');
    connectionRetries = 0;

    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    if (connectionSuccessTimer) {
      window.clearTimeout(connectionSuccessTimer);
    }

    connectionSuccessTimer = window.setTimeout(() => {
      isWebsocketConnecting.value = false;
      connectionSuccessTimer = null;
    }, 300);
  });

  IMSDK.on(CbEvents.OnConnectFailed, err => {
    console.error('[OpenIM] Connection failed:', err);

    if (connectionRetries < MAX_RETRIES) {
      connectionRetries++;
      const delay = RETRY_DELAY * connectionRetries;
      console.log(
        `[OpenIM] Attempting to reconnect in ${delay}ms (attempt ${connectionRetries}/${MAX_RETRIES})`
      );

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      reconnectTimeout = setTimeout(() => {
        const storedUser = sessionStorage.getItem('openim_user');
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            debouncedSetConnecting(true);
            IMSDK.login({
              platformID: userData.platformID,
              userID: userData.userID,
              token: userData.token,
              apiAddr: userData.apiAddr,
              wsAddr: userData.wsAddr
            }).catch(error => {
              console.error('[OpenIM] Reconnection failed:', error);
              debouncedSetConnecting(false);
            });
          } catch (e) {
            console.error(
              '[OpenIM] Failed to parse stored user data for reconnection:',
              e
            );
            debouncedSetConnecting(false);
          }
        } else {
          console.warn(
            '[OpenIM] No stored user data available for reconnection'
          );
          debouncedSetConnecting(false);
        }
      }, delay) as unknown as number;
    } else {
      console.error('[OpenIM] Maximum reconnection attempts reached');
      isWebsocketConnecting.value = false;
    }
  });

  IMSDK.on(CbEvents.OnTotalUnreadMessageCountChanged, ev => {
    const count = ev.data;
    setAllNotificationCount(count);
  });

  const batchUpdateConversations = debounce(ev => {
    const data = ev.data || [];
    updateConversationList(data.filter(item => !item.groupID));
    updateGroupList(data.filter(item => !!item.groupID));
  }, 100);

  IMSDK.on(CbEvents.OnConversationChanged, batchUpdateConversations);

  const batchProcessMessages = debounce(evt => {
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

      const batchSize = 10;
      for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);

        for (const message of batch) {
          if (!message) continue;

          const processedMessage = processIncomingMessage(message);
          if (!processedMessage) {
            continue;
          }

          const convId = generateConversationId(processedMessage);
          appendMessageToLocal(convId, processedMessage as OpenIMMessage);
        }
      }
    } catch (e) {
      console.error('[OpenIM] Failed to process incoming message event:', e);
    }
  }, 16);

  IMSDK.on(CbEvents.OnRecvNewMessages, batchProcessMessages);

  IMSDK.on(CbEvents.OnKickedOffline, () => {
    console.warn('[OpenIM] User was kicked offline');
    sessionStorage.removeItem('openim_user');
  });

  const batchProcessReadReceipts = debounce(evt => {
    const receipts = evt.data as any as Array<{
      conversationID: string;
      clientMsgID: string;
      readTime: number;
    }>;

    const groupedReceipts: Record<string, string[]> = {};
    receipts.forEach(r => {
      if (!groupedReceipts[r.conversationID]) {
        groupedReceipts[r.conversationID] = [];
      }
      groupedReceipts[r.conversationID].push(r.clientMsgID);
    });

    Object.entries(groupedReceipts).forEach(([conversationID, msgIds]) => {
      const msgs = getSavedMessages(conversationID);
      const msgIdSet = new Set(msgIds);

      msgs.forEach((msg, idx) => {
        if (msgIdSet.has(msg.clientMsgID)) {
          msgs[idx].isReadByPeer = true;
        }
      });

      saveMessagesToLocal(conversationID, msgs);
    });
  }, 100);

  IMSDK.on(CbEvents.OnRecvC2CReadReceipt, batchProcessReadReceipts);

  IMSDK.on(CbEvents.OnConnecting, () => {
    console.log('[OpenIM] Attempting to connect...');
  });
};

export const uploadFile = async (file: File) => {
  const TIMEOUT_DURATION = 60000;
  const clientUUID = generateUUID();

  try {
    const res = await withTimeout(
      IMSDK.uploadFile({
        name: clientUUID + '_' + file.name,
        contentType: file.type,
        uuid: clientUUID,
        file: file
      }),
      TIMEOUT_DURATION,
      'uploadFile'
    );

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

const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> => {
  let timeoutId: number;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs) as unknown as number;
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise
  ]);
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
  const TIMEOUT_DURATION = 15000;

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
        createResp = await withTimeout(
          IMSDK.createTextMessage(message || ''),
          TIMEOUT_DURATION,
          'createTextMessage'
        );
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
        createResp = await withTimeout(
          IMSDK.createFileMessageByFile({
            filePath: file.name,
            fileName: file.name,
            uuid: generateUUID(),
            sourceUrl: '',
            fileSize: file.size,
            fileType: file.type,
            file: file
          }),
          TIMEOUT_DURATION,
          'createFileMessageByFile'
        );
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
        createResp = await withTimeout(
          IMSDK.createImageMessageByFile({
            sourcePicture: picBaseInfo,
            bigPicture: picBaseInfo,
            snapshotPicture: picBaseInfo,
            sourcePath: file.name,
            file: file
          }),
          TIMEOUT_DURATION,
          'createImageMessageByFile'
        );
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

    const res = await withTimeout(
      IMSDK.sendMessage({
        message: msg,
        recvID: to,
        groupID: groupId
      }),
      TIMEOUT_DURATION,
      'sendMessage'
    );

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
  const TIMEOUT_DURATION = 15000;

  try {
    const response = await withTimeout(
      IMSDK.getAdvancedHistoryMessageList({
        conversationID: conversationId,
        startClientMsgID: lastClientMsgID,
        count: 50,
        viewType: 0
      }),
      TIMEOUT_DURATION,
      'getAdvancedHistoryMessageList'
    );

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
  const TIMEOUT_DURATION = 10000;

  try {
    await withTimeout(
      IMSDK.markConversationMessageAsRead(conversationID),
      TIMEOUT_DURATION,
      'markConversationMessageAsRead'
    );
  } catch (error) {
    console.error('[OpenIM] Failed to mark messages as read:', error);
  }
};

const messagesStore = shallowRef<Record<string, OpenIMMessage[]>>({});

const saveMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  messagesStore.value[conversationId] = [...messages];
};

const getSavedMessages = (conversationId: string): OpenIMMessage[] => {
  return messagesStore.value[conversationId] || [];
};

const appendMessageToLocal = (
  conversationId: string,
  message: OpenIMMessage
): void => {
  const arr = messagesStore.value[conversationId] || [];
  const newArr = [...arr, message];
  messagesStore.value[conversationId] = newArr;
};

const appendOldMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  const arr = messagesStore.value[conversationId] || [];
  const newArr = [...messages, ...arr];
  messagesStore.value[conversationId] = newArr;
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
