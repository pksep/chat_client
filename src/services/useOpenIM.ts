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

// Global state to track WebSocket connection status
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

// Connection state and reconnection settings
let connectionRetries = 0;
const MAX_RETRIES = 5;
const RETRY_DELAY = 3000; // 3 seconds
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

const setupOpenIM = (): void => {
  IMSDK.on(CbEvents.OnConnecting, () => {
    console.log('[OpenIM] Connecting...');
    isWebsocketConnecting.value = true;
  });

  let connectionSuccessTimer: number | null = null;

  IMSDK.on(CbEvents.OnConnectSuccess, () => {
    console.log('[OpenIM] Connection successful');
    connectionRetries = 0; // Reset retries on success

    // Clear any pending reconnection attempt
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }

    // Clear any previous timer
    if (connectionSuccessTimer) {
      window.clearTimeout(connectionSuccessTimer);
    }

    // Use requestAnimationFrame and setTimeout combination for better performance
    connectionSuccessTimer = window.setTimeout(() => {
      isWebsocketConnecting.value = false;
      connectionSuccessTimer = null;
    }, 300); // Reduced delay to improve responsiveness while still avoiding scroll jumps
  });

  IMSDK.on(CbEvents.OnConnectFailed, err => {
    console.error('[OpenIM] Connection failed:', err);

    // Implement reconnection logic with exponential backoff
    if (connectionRetries < MAX_RETRIES) {
      connectionRetries++;
      const delay = RETRY_DELAY * connectionRetries; // Exponential backoff
      console.log(
        `[OpenIM] Attempting to reconnect in ${delay}ms (attempt ${connectionRetries}/${MAX_RETRIES})`
      );

      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }

      reconnectTimeout = setTimeout(() => {
        // Attempt to reconnect
        // Get stored connection parameters from sessionStorage or similar
        const storedUser = sessionStorage.getItem('openim_user');
        if (storedUser) {
          try {
            const userData = JSON.parse(storedUser);
            // Mark as connecting again for reconnection attempts
            isWebsocketConnecting.value = true;
            IMSDK.login({
              platformID: userData.platformID,
              userID: userData.userID,
              token: userData.token,
              apiAddr: userData.apiAddr,
              wsAddr: userData.wsAddr
            }).catch(error => {
              console.error('[OpenIM] Reconnection failed:', error);
              isWebsocketConnecting.value = false;
            });
          } catch (e) {
            console.error(
              '[OpenIM] Failed to parse stored user data for reconnection:',
              e
            );
            isWebsocketConnecting.value = false;
          }
        } else {
          console.warn(
            '[OpenIM] No stored user data available for reconnection'
          );
          isWebsocketConnecting.value = false;
        }
      }, delay);
    } else {
      console.error('[OpenIM] Maximum reconnection attempts reached');
      isWebsocketConnecting.value = false;
    }
  });

  // Add cleanup function to properly dispose of resources
  const cleanup = () => {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = null;
    }
    if (connectionSuccessTimer) {
      clearTimeout(connectionSuccessTimer);
      connectionSuccessTimer = null;
    }
  };

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

      list.forEach((message: ProcessedMessage) => {
        if (!message) return;

        const processedMessage = processIncomingMessage(message);
        if (!processedMessage) {
          return;
        }

        const convId = generateConversationId(processedMessage);
        appendMessageToLocal(convId, processedMessage as OpenIMMessage);
      });
    } catch (e) {
      console.error('[OpenIM] Failed to process incoming message event:', e);
    }
  });

  // Handle connection disconnection
  // Note: OnUserSigExpired not available in current SDK version

  IMSDK.on(CbEvents.OnKickedOffline, () => {
    console.warn('[OpenIM] User was kicked offline');
    // Clear stored user data to prevent auto-reconnection with invalid credentials
    sessionStorage.removeItem('openim_user');
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

  // Handle network errors and disconnections
  IMSDK.on(CbEvents.OnConnecting, () => {
    console.log('[OpenIM] Attempting to connect...');
  });
};

export const uploadFile = async (file: File) => {
  const TIMEOUT_DURATION = 60000; // 60 seconds timeout for file uploads
  const formData = new FormData();
  formData.append('file', file);
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

// Utility function to wrap OpenIM operations with timeout
const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string
): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then(result => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
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
  const TIMEOUT_DURATION = 15000; // 15 seconds timeout

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
  const TIMEOUT_DURATION = 15000; // 15 seconds timeout

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
  const TIMEOUT_DURATION = 10000; // 10 seconds timeout

  try {
    await withTimeout(
      IMSDK.markConversationMessageAsRead(conversationID),
      TIMEOUT_DURATION,
      'markConversationMessageAsRead'
    );
  } catch (error) {
    console.error('[OpenIM] Failed to mark messages as read:', error);
    // Don't throw here as it's not critical for the UI flow
  }
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
