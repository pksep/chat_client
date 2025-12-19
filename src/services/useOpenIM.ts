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

      // Retry sending queued messages when connection is restored
      retryQueuedMessages();

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

  // Check if websocket is connecting/disconnected
  if (getIsWebsocketConnecting()) {
    // Create a temporary message object to add to the queue
    const tempMsg: OpenIMMessage = {
      clientMsgID,
      sendID: '', // Will be filled when actually sent
      recvID: to,
      groupID: groupId,
      sendTime: Date.now(),
      textElem: { content: message || '' },
      status: 1, // Mark as loading
      isRead: false,
      msgFrom: 0,
      contentType: type === 'text' ? 101 : type === 'image' ? 102 : 105, // 101:text, 102:image, 105:file
      seq: 0,
      sessionType: to ? 1 : 3 // 1: single chat, 3: group chat
    };

    // Determine conversation ID
    let convId = '';
    if (groupId) {
      convId = `sg_${groupId}`;
    } else if (to) {
      // In a real scenario, we would have the sender's ID, but at this point
      // we might not have it. We'll use a placeholder or get it from session storage
      const senderId = sessionStorage.getItem('openim_user')
        ? JSON.parse(sessionStorage.getItem('openim_user')!).userID
        : 'temp_sender';
      const [smallerUserID, largerUserID] = [senderId, to].sort();
      convId = `si_${smallerUserID}_${largerUserID}`;
    }

    // Add to outgoing queue for when connection is restored
    addToOutgoingMessageQueue(convId, tempMsg);

    // Update UI to show the queued message with loading status
    appendMessageToLocal(convId, tempMsg);

    // Don't throw an error, as this is expected behavior when offline
    return;
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

    // Determine the conversation ID based on message type
    let convId = '';
    if (groupId) {
      // For group messages
      convId = `sg_${groupId}`;
    } else if (to) {
      // For single chat messages
      // Use the sender and receiver IDs to construct the conversation ID
      const senderId = res.data.sendID;
      const receiverId = res.data.recvID || to;
      const [smallerUserID, largerUserID] = [senderId, receiverId].sort();
      convId = `si_${smallerUserID}_${largerUserID}`;
    } else {
      throw new Error('Could not determine conversation ID for message');
    }

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

    // If sending failed, queue the message for later
    const tempMsg: OpenIMMessage = {
      clientMsgID,
      sendID: '', // Will be filled when actually sent
      recvID: to,
      groupID: groupId,
      sendTime: Date.now(),
      textElem: { content: message || '' },
      status: 1, // Mark as loading
      isRead: false,
      msgFrom: 0,
      contentType: type === 'text' ? 101 : type === 'image' ? 102 : 105, // 101:text, 102:image, 105:file
      seq: 0,
      sessionType: to ? 1 : 3 // 1: single chat, 3: group chat
    };

    // Determine conversation ID
    let convId = '';
    if (groupId) {
      convId = `sg_${groupId}`;
    } else if (to) {
      // In a real scenario, we would have the sender's ID, but at this point
      // we might not have it. We'll use a placeholder or get it from session storage
      const senderId = sessionStorage.getItem('openim_user')
        ? JSON.parse(sessionStorage.getItem('openim_user')!).userID
        : 'temp_sender';
      const [smallerUserID, largerUserID] = [senderId, to].sort();
      convId = `si_${smallerUserID}_${largerUserID}`;
    }

    // Add to outgoing queue for when connection is restored
    addToOutgoingMessageQueue(convId, tempMsg);

    // Update UI to show the queued message with loading status
    appendMessageToLocal(convId, tempMsg);

    // Don't throw an error, as we've queued the message for later
    return;
  }
};

const retryQueuedMessages = async (): Promise<void> => {
  // Create a copy of the queue to avoid modifying during iteration
  const queueCopy = { ...outgoingMessageQueue.value };

  for (const [conversationId, queuedMessages] of Object.entries(queueCopy)) {
    if (queuedMessages && queuedMessages.length > 0) {
      // Process each message in the queue for this conversation
      for (const message of [...queuedMessages]) {
        // Create a copy to avoid reference issues
        try {
          // Determine if this is a group or single chat
          const isGroupChat = conversationId.startsWith('sg_');
          const groupId = isGroupChat ? conversationId.substring(3) : '';
          // For single chat, we need to extract the receiver ID from the conversation ID
          let to = '';
          if (!isGroupChat && conversationId.startsWith('si_')) {
            const parts = conversationId.substring(3).split('_');
            if (parts.length === 2) {
              const [userId1, userId2] = parts;
              // Use the session storage to get current user ID to determine the recipient
              const currentUserId = sessionStorage.getItem('openim_user')
                ? JSON.parse(sessionStorage.getItem('openim_user')!).userID
                : '';
              to = currentUserId === userId1 ? userId2 : userId1;
            }
          }

          // Determine the message type and content
          if (message.textElem?.content) {
            await sendMessageIM({
              to,
              groupId,
              message: message.textElem.content,
              type: 'text'
            });
            // Remove the successfully sent message from the queue
            removeFromOutgoingQueue(conversationId, message.clientMsgID);
          } else if (message.pictureElem) {
            // For image messages, we would need to handle file re-uploads
            console.warn('Image message retry not implemented yet');
          } else if (message.fileElem) {
            // For file messages, we would need to handle file re-uploads
            console.warn('File message retry not implemented yet');
          }
        } catch (error) {
          console.error(
            `Failed to retry sending message ${message.clientMsgID}:`,
            error
          );
          // Keep the message in the queue if retry fails
        }
      }
    }
  }
};

const removeFromOutgoingQueue = (
  conversationId: string,
  clientMsgID: string
): void => {
  const queue = outgoingMessageQueue.value[conversationId] || [];
  const updatedQueue = queue.filter(msg => msg.clientMsgID !== clientMsgID);
  outgoingMessageQueue.value[conversationId] = updatedQueue;
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

// Store for outgoing messages that couldn't be sent due to disconnection
const outgoingMessageQueue = shallowRef<Record<string, OpenIMMessage[]>>({});

const saveMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  messagesStore.value[conversationId] = [...messages];
};

const getSavedMessages = (conversationId: string): OpenIMMessage[] => {
  return messagesStore.value[conversationId] || [];
};

const getOutgoingMessageQueue = (conversationId: string): OpenIMMessage[] => {
  return outgoingMessageQueue.value[conversationId] || [];
};

const addToOutgoingMessageQueue = (
  conversationId: string,
  message: OpenIMMessage
): void => {
  const queue = outgoingMessageQueue.value[conversationId] || [];
  const newQueue = [...queue, message];
  outgoingMessageQueue.value[conversationId] = newQueue;
};

interface OpenIMMessageWithLoading extends OpenIMMessage {
  loading?: boolean;
}

const getMessagesWithLoadingStatus = (
  conversationId: string
): OpenIMMessageWithLoading[] => {
  // Return cached messages from the store, and if service is disconnected,
  // add loading status to messages
  const cachedMessages = getSavedMessages(conversationId);
  const hasConnection = !getIsWebsocketConnecting();

  let finalMessages = [...cachedMessages];

  if (!hasConnection) {
    // When service is disconnected, mark existing messages as loading
    finalMessages = finalMessages.map(msg => ({
      ...msg,
      status: 1, // Mark as loading/sending
      loading: true
    }));

    // Include any messages that were queued for sending but couldn't be sent
    const queuedMessages = getOutgoingMessageQueue(conversationId);
    finalMessages = [...finalMessages, ...queuedMessages];
  }

  return finalMessages;
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
  getMessagesWithLoadingStatus,
  addToOutgoingMessageQueue,
  appendMessageToLocal,
  markAsRead
};
