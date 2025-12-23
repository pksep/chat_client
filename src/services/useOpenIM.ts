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
import { getAuthUser } from '../composables/useAuth';

const isWebsocketConnecting = ref(false);

export const getIsWebsocketConnecting = () => isWebsocketConnecting.value;

// Function to check if there was a recent reconnection (within last 2 seconds)
const isRecentlyReconnected = () => {
  return Date.now() - connectionState.lastReconnectTime < 2000;
};

export type IMSDKType = ReturnType<typeof getSDK>;

// Singleton instance with proper error handling
const IMSDK: IMSDKType = (() => {
  try {
    return getSDK({
      debug: false,
      coreWasmPath: '/openIM.wasm',
      sqlWasmPath: '/sql-wasm.wasm'
    });
  } catch (error) {
    console.error('[OpenIM] Failed to initialize SDK:', error);
    throw new Error('Failed to initialize OpenIM SDK');
  }
})();

if (import.meta.hot) {
  import.meta.hot.accept(() => {});
  import.meta.hot.dispose(() => {});
}

// Connection management
interface ConnectionState {
  retries: number;
  reconnectTimeout: number | null;
  connectionSuccessTimer: number | null;
  lastReconnectTime: number; // Track the last reconnection time
}

const connectionState: ConnectionState = {
  retries: 0,
  reconnectTimeout: null,
  connectionSuccessTimer: null,
  lastReconnectTime: 0
};

// Debounce utility type
type DebouncedFunction<T extends (...args: any[]) => any> = (
  ...args: Parameters<T>
) => void;

// Debounce utility with proper cleanup
function createDebouncedFunction<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: number | null = null;

  return ((...args: Parameters<T>): void => {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout !== null) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait) as unknown as number;
  }) as DebouncedFunction<T>;
}

const setupOpenIM = (): void => {
  const debouncedSetConnecting = createDebouncedFunction((val: boolean) => {
    isWebsocketConnecting.value = val;
  }, 300);

  // Connection event handlers
  const handleConnecting = () => {
    console.log('[OpenIM] Connecting...');
    debouncedSetConnecting(true);
  };

  const handleConnectSuccess = () => {
    console.log('[OpenIM] Connection successful');
    connectionState.retries = 0;

    if (connectionState.reconnectTimeout) {
      clearTimeout(connectionState.reconnectTimeout);
      connectionState.reconnectTimeout = null;
    }

    if (connectionState.connectionSuccessTimer) {
      clearTimeout(connectionState.connectionSuccessTimer);
      connectionState.connectionSuccessTimer = null;
    }

    // Update the last reconnection time
    connectionState.lastReconnectTime = Date.now();

    // Delay the state update slightly to prevent race conditions after reconnection
    requestAnimationFrame(() => {
      isWebsocketConnecting.value = false;
      // Only retry queued messages after a small delay to avoid conflicts
      setTimeout(() => {
        retryQueuedMessages();
      }, 300);
    });
  };

  const handleConnectFailed = async (err: any) => {
    console.error('[OpenIM] Connection failed:', err);

    // Simply set connecting state to false without retrying
    isWebsocketConnecting.value = false;

    // Check if it's a token expiration error and attempt to refresh
    if (err?.errCode === 403 || err?.message?.includes('token')) {
      console.log('[OpenIM] Token may have expired, attempting to refresh...');
      await attemptTokenRefresh();
    }
  };

  const attemptTokenRefresh = async () => {
    try {
      // Dynamically import to avoid circular dependencies
      const { useAuth } = await import('../composables/useAuth');
      const { getConfig } = await import('./useConfig');

      const config = getConfig();
      const localToken = localStorage.getItem('erp_token');

      if (!localToken) {
        console.error('[OpenIM] No stored token available for refresh');
        return;
      }

      const authData = await useAuth(localToken);
      const storedUser = sessionStorage.getItem('openim_user');
      const userData = storedUser ? JSON.parse(storedUser) : {};

      // Update stored user data with new token
      const newUserData = {
        ...userData,
        token: authData.token,
        userID: authData.UserID,
        platformID: authData.PlatformID
      };

      sessionStorage.setItem('openim_user', JSON.stringify(newUserData));

      // Attempt to login with new token
      await IMSDK.login({
        platformID: authData.PlatformID,
        userID: authData.UserID,
        token: authData.token,
        apiAddr: config.CHAT_OPENIM_API_DOMAIN,
        wsAddr: config.CHAT_OPENIM_WS_DOMAIN
      });

      connectionState.retries = 0;
      console.log('[OpenIM] Successfully reconnected with refreshed token');
    } catch (refreshError) {
      console.error('[OpenIM] Token refresh failed:', refreshError);
    }
  };

  const handleKickedOffline = async () => {
    console.warn('[OpenIM] User was kicked offline');

    // Clear the user data
    sessionStorage.removeItem('openim_user');

    // Attempt to re-authenticate and reconnect
    console.log(
      '[OpenIM] Attempting to re-authenticate after being kicked offline...'
    );
    await attemptTokenRefresh();
  };

  // Register event handlers
  IMSDK.on(CbEvents.OnConnecting, handleConnecting);
  IMSDK.on(CbEvents.OnConnectSuccess, handleConnectSuccess);
  IMSDK.on(CbEvents.OnConnectFailed, handleConnectFailed);
  IMSDK.on(CbEvents.OnKickedOffline, handleKickedOffline);

  // Notification and conversation updates
  const batchUpdateConversations = createDebouncedFunction((ev: any) => {
    const data = ev.data || [];
    updateConversationList(data.filter((item: any) => !item.groupID));
    updateGroupList(data.filter((item: any) => !!item.groupID));
  }, 100);

  IMSDK.on(CbEvents.OnTotalUnreadMessageCountChanged, ev => {
    const count = ev.data;
    setAllNotificationCount(count);
  });

  IMSDK.on(CbEvents.OnConversationChanged, batchUpdateConversations);

  const batchProcessMessages = createDebouncedFunction((evt: any) => {
    try {
      const payload = evt?.data;
      if (!payload) return;

      let list: ProcessedMessage[] = [];

      if (Array.isArray(payload)) {
        list = payload as ProcessedMessage[];
      } else if (payload?.messageList && Array.isArray(payload.messageList)) {
        list = payload.messageList;
      } else {
        list = [payload as ProcessedMessage];
      }

      if (!Array.isArray(list)) {
        console.warn('[OpenIM] Unexpected message format:', payload);
        return;
      }

      const batchSize = 10;
      let enableAudio = false;

      for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);

        let processedMessage: ProcessedMessage | null = null;
        for (const message of batch) {
          if (!message) continue;

          const currentProcessedMessage = processIncomingMessage(message);
          if (!currentProcessedMessage) {
            continue;
          }

          if (!enableAudio) {
            enableAudio = !currentProcessedMessage.notificationElem;
          }

          const convId = generateConversationId(currentProcessedMessage);
          appendMessageToLocal(
            convId,
            currentProcessedMessage as OpenIMMessage
          );

          processedMessage = currentProcessedMessage;
        }

        if (!enableAudio && processedMessage) {
          const user = getAuthUser();
          enableAudio =
            !processedMessage.notificationElem &&
            processedMessage.sendID !== user.userID;
        }

        if (processedMessage) {
          const convId = generateConversationId(processedMessage);
          appendMessageToLocal(convId, processedMessage as OpenIMMessage);
        }
      }

      if (enableAudio) {
        new Audio('/audio/new-message.mp3').play().catch(e => {
          console.error('Failed to play notification sound:', e);
        });
      }
    } catch (e) {
      console.error('[OpenIM] Failed to process incoming message event:', e);
    }
  }, 16);

  IMSDK.on(CbEvents.OnRecvNewMessages, batchProcessMessages);

  // Read receipts processing
  const batchProcessReadReceipts = createDebouncedFunction((evt: any) => {
    const receipts = evt.data as Array<{
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

      const updatedMsgs = msgs.map(msg => {
        if (msgIdSet.has(msg.clientMsgID)) {
          return {
            ...msg,
            isReadByPeer: true
          };
        }
        return msg;
      });

      saveMessagesToLocal(conversationID, updatedMsgs);
    });
  }, 100);

  IMSDK.on(CbEvents.OnRecvC2CReadReceipt, batchProcessReadReceipts);
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

// Message sending type definitions
type MessageSendingParams = {
  to: string;
  groupId: string;
  message?: string;
  type?: 'text' | 'file' | 'image';
  file?: File;
};

type MessageContentType = 101 | 102 | 105; // 101:text, 102:image, 105:file
type SessionType = 1 | 3; // 1: single chat, 3: group chat

// Helper function to determine content type based on message type
const getContentType = (type: string): MessageContentType => {
  switch (type) {
    case 'text':
      return 101;
    case 'image':
      return 102;
    case 'file':
      return 105;
    default:
      throw new Error('Unsupported message type');
  }
};

// Helper function to determine session type based on to and groupId
const getSessionType = (to: string, groupId: string): SessionType => {
  // 1: single chat (when 'to' is provided), 3: group chat (when 'groupId' is provided)
  return groupId ? 3 : 1;
};

// Helper function to determine conversation ID
const determineConversationId = (to: string, groupId: string): string => {
  if (groupId) {
    return `sg_${groupId}`;
  } else if (to) {
    const senderId = sessionStorage.getItem('openim_user')
      ? JSON.parse(sessionStorage.getItem('openim_user')!).userID
      : 'temp_sender';
    const [smallerUserID, largerUserID] = [senderId, to].sort();
    return `si_${smallerUserID}_${largerUserID}`;
  }
  throw new Error('Could not determine conversation ID for message');
};

export const sendMessageIM = async ({
  to,
  groupId,
  message,
  type = 'text',
  file
}: MessageSendingParams): Promise<void> => {
  const clientMsgID = generateUUID();
  const TIMEOUT_DURATION = 15000;
  const contentType = getContentType(type);
  const sessionType = getSessionType(to, groupId);

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
      isReadByPeer: false,
      msgFrom: 0,
      contentType,
      seq: 0,
      sessionType
    };

    const convId = determineConversationId(to, groupId);

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
    const convId = determineConversationId(to, groupId);

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
      isReadByPeer: false,
      msgFrom: 0,
      contentType,
      seq: 0,
      sessionType
    };

    const convId = determineConversationId(to, groupId);

    addToOutgoingMessageQueue(convId, tempMsg);

    appendMessageToLocal(convId, tempMsg);

    return;
  }
};

const extractRecipientId = (conversationId: string): string => {
  if (!conversationId.startsWith('si_')) return '';

  const parts = conversationId.substring(3).split('_');
  if (parts.length !== 2) return '';

  const [userId1, userId2] = parts;
  const currentUserId = sessionStorage.getItem('openim_user')
    ? JSON.parse(sessionStorage.getItem('openim_user')!).userID
    : '';

  return currentUserId === userId1 ? userId2 : userId1;
};

const retryQueuedMessages = async (): Promise<void> => {
  const queueCopy = { ...outgoingMessageQueue.value };

  for (const [conversationId, queuedMessages] of Object.entries(queueCopy)) {
    if (queuedMessages && queuedMessages.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));

      // Process each message in the queue for this conversation
      for (const message of [...queuedMessages]) {
        try {
          // Determine if this is a group or single chat
          const isGroupChat = conversationId.startsWith('sg_');
          const actualGroupId = isGroupChat ? conversationId.substring(3) : '';
          const to = isGroupChat ? '' : extractRecipientId(conversationId);

          // Determine the message type and content
          if (message.textElem?.content) {
            await sendMessageIM({
              to,
              groupId: actualGroupId,
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

interface GetMessageListParams {
  conversationID: string;
  startClientMsgID: string;
  count: number;
  viewType: number;
}

const getMessagesByConversationId = async (
  conversationId: string,
  lastClientMsgID: string = ''
): Promise<OpenIMMessage[]> => {
  const TIMEOUT_DURATION = 15000;

  try {
    const params: GetMessageListParams = {
      conversationID: conversationId,
      startClientMsgID: lastClientMsgID,
      count: 50,
      viewType: 0
    };

    const response = await withTimeout(
      IMSDK.getAdvancedHistoryMessageList(params),
      TIMEOUT_DURATION,
      'getAdvancedHistoryMessageList'
    );

    const messages: OpenIMMessage[] = response.data.messageList || [];

    // Only update local storage if we have messages to append
    if (messages.length > 0) {
      if (lastClientMsgID) {
        appendOldMessagesToLocal(conversationId, messages);
      } else {
        saveMessagesToLocal(conversationId, messages);
      }
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

interface MarkAsReadError extends Error {
  errCode?: number;
}

const markAsRead = async (conversationID: string) => {
  const TIMEOUT_DURATION = 10000;

  try {
    // Check if conversationID is valid before attempting to mark as read
    if (!conversationID) {
      console.warn(
        '[OpenIM] Cannot mark messages as read: conversationID is empty or null'
      );
      return;
    }

    await withTimeout(
      IMSDK.markConversationMessageAsRead(conversationID),
      TIMEOUT_DURATION,
      'markConversationMessageAsRead'
    );

    // Update local messages to mark them as read
    // Get all messages in this conversation and update their isRead status
    const messages = getSavedMessages(conversationID);
    const currentUserID = sessionStorage.getItem('openim_user')
      ? JSON.parse(sessionStorage.getItem('openim_user')!).userID
      : '';
    const updatedMessages = messages.map(msg => {
      // Only mark as read if it's a message from someone else (received message)
      // Don't mark our own messages as read
      if (msg.sendID !== currentUserID) {
        return {
          ...msg,
          isRead: true
        };
      }
      return msg;
    });

    saveMessagesToLocal(conversationID, updatedMessages);
  } catch (error: any) {
    const typedError = error as MarkAsReadError;

    // Check if it's the specific RecordNotFoundError (errCode 1004)
    if (typedError?.errCode === 1004) {
      console.warn(
        `[OpenIM] Conversation not found when trying to mark messages as read (conversationID: ${conversationID}):`,
        typedError
      );
      // Don't throw the error, just log it as a warning since it's an expected scenario
      return;
    } else {
      console.error('[OpenIM] Failed to mark messages as read:', typedError);
      // Re-throw other errors as they might be actual issues
      throw typedError;
    }
  }
};

const messagesStore = shallowRef<Record<string, OpenIMMessage[]>>({});

// Store for outgoing messages that couldn't be sent due to disconnection
const outgoingMessageQueue = shallowRef<Record<string, OpenIMMessage[]>>({});

const saveMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  const messagesWithDefaults = messages.map(msg => ({
    ...msg,
    isReadByPeer: msg.isReadByPeer ?? false
  }));

  messagesStore.value[conversationId] = [...messagesWithDefaults];
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
  const cachedMessages = getSavedMessages(conversationId);
  const hasConnection = !getIsWebsocketConnecting();

  let finalMessages = [...cachedMessages];

  if (!hasConnection) {
    finalMessages = finalMessages.map(msg => ({
      ...msg,
      isReadByPeer: msg.isReadByPeer ?? false,
      status: 1,
      loading: true
    }));

    const queuedMessages = getOutgoingMessageQueue(conversationId);
    finalMessages = [...finalMessages, ...queuedMessages];
  }

  return finalMessages;
};

const appendMessageToLocal = (
  conversationId: string,
  message: OpenIMMessage
): void => {
  const messageWithDefaults = {
    ...message,
    isReadByPeer: message.isReadByPeer ?? false
  };

  const arr = messagesStore.value[conversationId] || [];
  const newArr = [...arr, messageWithDefaults];
  messagesStore.value[conversationId] = newArr;
};

const appendOldMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  const messagesWithDefaults = messages.map(msg => ({
    ...msg,
    isReadByPeer: msg.isReadByPeer ?? false
  }));

  const arr = messagesStore.value[conversationId] || [];
  const newArr = [...messagesWithDefaults, ...arr];
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
  markAsRead,
  isRecentlyReconnected
};
