import { CbEvents, getSDK } from '@openim/wasm-client-sdk';

import { ref, shallowRef } from 'vue';
import {
  setAllNotificationCount,
  updateConversationList,
  updateColumnsConversation
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

interface ConnectionState {
  lastReconnectTime: number;
}

const connectionState: ConnectionState = {
  lastReconnectTime: 0
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

const immediateSetConnecting = (val: boolean) => {
  isWebsocketConnecting.value = val;
};

const setupOpenIM = (): void => {
  const handleConnecting = () => {
    console.log('[OpenIM] Connecting...');
    immediateSetConnecting(true);
  };

  const handleConnectSuccess = () => {
    console.log('[OpenIM] Connection successful');

    connectionState.lastReconnectTime = Date.now();

    setTimeout(() => {
      isWebsocketConnecting.value = false;

      setTimeout(() => {
        retryQueuedMessages();
      }, 100);
    }, 50);
  };

  const handleConnectFailed = async (err: any) => {
    console.error('[OpenIM] Connection failed:', err);
    isWebsocketConnecting.value = false;

    if (err?.errCode === 403 || err?.message?.includes('token')) {
      console.log('[OpenIM] Token may have expired, attempting to refresh...');
      await attemptTokenRefresh();
    }
  };

  const attemptTokenRefresh = async () => {
    try {
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

      const newUserData = {
        ...userData,
        token: authData.token,
        userID: authData.UserID,
        platformID: authData.PlatformID
      };

      sessionStorage.setItem('openim_user', JSON.stringify(newUserData));

      await IMSDK.login({
        platformID: authData.PlatformID,
        userID: authData.UserID,
        token: authData.token,
        apiAddr: config.CHAT_OPENIM_API_DOMAIN,
        wsAddr: config.CHAT_OPENIM_WS_DOMAIN
      });

      const { fetchAuthUser } = await import('../composables/useAuth');
      await fetchAuthUser();

      console.log('[OpenIM] Successfully reconnected with refreshed token');
    } catch (refreshError) {
      console.error('[OpenIM] Token refresh failed:', refreshError);
    }
  };

  const handleKickedOffline = async () => {
    console.warn('[OpenIM] User was kicked offline');

    sessionStorage.removeItem('openim_user');

    console.log(
      '[OpenIM] Attempting to re-authenticate after being kicked offline...'
    );
    await attemptTokenRefresh();
  };

  IMSDK.on(CbEvents.OnConnecting, handleConnecting);
  IMSDK.on(CbEvents.OnConnectSuccess, handleConnectSuccess);
  IMSDK.on(CbEvents.OnConnectFailed, handleConnectFailed);
  IMSDK.on(CbEvents.OnKickedOffline, handleKickedOffline);

  const updateConversations = (ev: any) => {
    const data = ev.data || [];
    updateConversationList(data.filter((item: any) => !item.groupID));
    updateGroupList(data.filter((item: any) => !!item.groupID));
  };

  IMSDK.on(CbEvents.OnTotalUnreadMessageCountChanged, ev => {
    const count = ev.data;
    setAllNotificationCount(count);
  });

  IMSDK.on(CbEvents.OnConversationChanged, updateConversations);

  const processMessages = (evt: any) => {
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

      let enableAudio = false;
      const user = getAuthUser();

      for (const message of list) {
        if (!message) continue;

        const currentProcessedMessage = processIncomingMessage(message);
        if (!currentProcessedMessage) {
          continue;
        }

        if (
          !enableAudio &&
          !currentProcessedMessage.notificationElem &&
          currentProcessedMessage.sendID !== user?.userID
        ) {
          enableAudio = true;
        }

        const convId = generateConversationId(currentProcessedMessage);
        appendMessageToLocal(convId, currentProcessedMessage as OpenIMMessage);
      }

      if (enableAudio) {
        new Audio('/audio/new-message.mp3').play().catch(e => {
          console.error('Failed to play notification sound:', e);
        });
      }
    } catch (e) {
      console.error('[OpenIM] Failed to process incoming message event:', e);
    }
  };

  IMSDK.on(CbEvents.OnRecvNewMessages, processMessages);

  const processReadReceipts = (evt: any) => {
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
  };

  IMSDK.on(CbEvents.OnRecvC2CReadReceipt, processReadReceipts);
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

type MessageSendingParams = {
  to: string;
  groupId: string;
  message?: string;
  type?: 'text' | 'file' | 'image';
  file?: File;
};

type MessageContentType = 101 | 102 | 105;
type SessionType = 1 | 3;

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

const getSessionType = (to: string, groupId: string): SessionType => {
  // 1: single chat (when 'to' is provided), 3: group chat (when 'groupId' is provided)
  return groupId ? 3 : 1;
};

const determineConversationId = (to: string, groupId: string): string => {
  if (groupId) {
    return `sg_${groupId}`;
  } else if (to) {
    const currentUser = getAuthUser();
    const senderId = currentUser?.userID || 'temp_sender';
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

  if (getIsWebsocketConnecting()) {
    const currentUser = getAuthUser();
    const currentUserID = currentUser?.userID || '';

    const tempMsg: OpenIMMessage = {
      clientMsgID,
      sendID: currentUserID,
      recvID: to,
      groupID: groupId,
      sendTime: Date.now(),
      textElem: { content: message || '' },
      status: 1,
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

  const timeSinceReconnect = Date.now() - connectionState.lastReconnectTime;
  if (timeSinceReconnect < 500) {
    await new Promise(resolve => setTimeout(resolve, 100));
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

      const { width, height } = await getImageSize(file);

      const picBaseInfo = {
        uuid: generateUUID(),
        type: file.type,
        size: file.size,
        width,
        height,
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

    const convId = determineConversationId(to, groupId);

    const serverMessage = {
      ...res.data,
      isReadByPeer: (res.data as any).isReadByPeer ?? false
    };

    // Use appendMessageToLocal which handles duplicates properly
    appendMessageToLocal(convId, serverMessage);

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

    const currentUser = getAuthUser();
    const currentUserID = currentUser?.userID || '';

    const tempMsg: OpenIMMessage = {
      clientMsgID,
      sendID: currentUserID,
      recvID: to,
      groupID: groupId,
      sendTime: Date.now(),
      textElem: { content: message || '' },
      status: 1,
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
  const currentUser = getAuthUser();
  const currentUserId = currentUser?.userID || '';

  return currentUserId === userId1 ? userId2 : userId1;
};

const retryQueuedMessages = async (): Promise<void> => {
  const queueCopy = { ...outgoingMessageQueue.value };

  for (const [conversationId, queuedMessages] of Object.entries(queueCopy)) {
    if (queuedMessages && queuedMessages.length > 0) {
      for (const message of [...queuedMessages]) {
        try {
          const isGroupChat = conversationId.startsWith('sg_');
          const actualGroupId = isGroupChat ? conversationId.substring(3) : '';
          const to = isGroupChat ? '' : extractRecipientId(conversationId);

          if (message.textElem?.content) {
            removeFromOutgoingQueue(conversationId, message.clientMsgID);

            await sendMessageIM({
              to,
              groupId: actualGroupId,
              message: message.textElem.content,
              type: 'text'
            });
          } else if (message.pictureElem) {
            console.warn('Image message retry not implemented yet');
            addToOutgoingMessageQueue(conversationId, message);
          } else if (message.fileElem) {
            console.warn('File message retry not implemented yet');
            addToOutgoingMessageQueue(conversationId, message);
          }
        } catch (error) {
          console.error(
            `Failed to retry sending message ${message.clientMsgID}:`,
            error
          );
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
    if (!conversationID) {
      return;
    }

    await withTimeout(
      IMSDK.markConversationMessageAsRead(conversationID),
      TIMEOUT_DURATION,
      'markConversationMessageAsRead'
    );

    const messages = getSavedMessages(conversationID);
    const currentUser = getAuthUser();
    const currentUserID = currentUser?.userID || '';
    const updatedMessages = messages.map(msg => {
      if (msg.sendID !== currentUserID) {
        return {
          ...msg,
          isRead: true
        };
      }
      return msg;
    });

    saveMessagesToLocal(conversationID, updatedMessages);

    // Update the conversation's notification count to 0 since we've read all messages
    updateColumnsConversation(conversationID, {
      notificationCount: 0
    });
  } catch (error: any) {
    const typedError = error as MarkAsReadError;

    if (typedError?.errCode === 1004) {
      return;
    } else {
      console.error('[OpenIM] Failed to mark messages as read:', typedError);
      throw typedError;
    }
  }
};

const messagesStore = shallowRef<Record<string, OpenIMMessage[]>>({});

const outgoingMessageQueue = shallowRef<Record<string, OpenIMMessage[]>>({});

const saveMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  const messagesWithDefaults = new Array(messages.length);
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    messagesWithDefaults[i] = {
      ...msg,
      isReadByPeer: msg.isReadByPeer ?? false
    };
  }

  messagesStore.value[conversationId] = messagesWithDefaults;

  messageChangeCallbacks.forEach(callback => {
    try {
      callback(conversationId);
    } catch (error) {
      console.error('Error in message change callback:', error);
    }
  });
};

const getSavedMessages = (conversationId: string): OpenIMMessage[] => {
  const messages = messagesStore.value[conversationId];
  return messages ? messages : [];
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

  if (hasConnection) {
    return cachedMessages as OpenIMMessageWithLoading[];
  }

  const messagesWithStatus = new Array(cachedMessages.length);
  for (let i = 0; i < cachedMessages.length; i++) {
    const msg = cachedMessages[i];
    messagesWithStatus[i] = {
      ...msg,
      isReadByPeer: msg.isReadByPeer ?? false,
      status: 1,
      loading: true
    };
  }

  const queuedMessages = getOutgoingMessageQueue(conversationId);
  const totalLength = messagesWithStatus.length + queuedMessages.length;
  const finalMessages = new Array(totalLength);

  for (let i = 0; i < messagesWithStatus.length; i++) {
    finalMessages[i] = messagesWithStatus[i];
  }

  for (let i = 0; i < queuedMessages.length; i++) {
    finalMessages[messagesWithStatus.length + i] = queuedMessages[i];
  }

  return finalMessages;
};

const messageChangeCallbacks: Array<(conversationId?: string) => void> = [];

export const subscribeToMessageChanges = (
  callback: (conversationId?: string) => void
): (() => void) => {
  messageChangeCallbacks.push(callback);

  return () => {
    const index = messageChangeCallbacks.indexOf(callback);
    if (index > -1) {
      messageChangeCallbacks.splice(index, 1);
    }
  };
};

const appendMessageToLocal = (
  conversationId: string,
  message: OpenIMMessage
): void => {
  const existingMessages = messagesStore.value[conversationId] || [];

  const existingIndex = existingMessages.findIndex(
    msg => msg.clientMsgID === message.clientMsgID
  );

  if (existingIndex !== -1) {
    const updatedMessages = [...existingMessages];
    updatedMessages[existingIndex] = {
      ...message,
      isReadByPeer: message.isReadByPeer ?? false
    };
    messagesStore.value[conversationId] = updatedMessages;
  } else {
    const newLength = existingMessages.length + 1;
    const newArr = new Array(newLength);

    for (let i = 0; i < existingMessages.length; i++) {
      newArr[i] = existingMessages[i];
    }

    newArr[newLength - 1] = {
      ...message,
      isReadByPeer: message.isReadByPeer ?? false
    };

    messagesStore.value[conversationId] = newArr;
  }

  messageChangeCallbacks.forEach(callback => {
    try {
      callback(conversationId);
    } catch (error) {
      console.error('Error in message change callback:', error);
    }
  });
};

const appendOldMessagesToLocal = (
  conversationId: string,
  messages: OpenIMMessage[]
): void => {
  const existingMessages = messagesStore.value[conversationId] || [];

  const messagesWithDefaults = new Array(messages.length);
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    messagesWithDefaults[i] = {
      ...msg,
      isReadByPeer: msg.isReadByPeer ?? false
    };
  }

  messagesStore.value[conversationId] = [
    ...messagesWithDefaults,
    ...existingMessages
  ];

  messageChangeCallbacks.forEach(callback => {
    try {
      callback(conversationId);
    } catch (error) {
      console.error('Error in message change callback:', error);
    }
  });
};

const IMSDK = (() => {
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

const isRecentlyReconnected = () => {
  return Date.now() - connectionState.lastReconnectTime < 3000;
};

export const getImageSize = (
  file: File
): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith('image/')) {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
        URL.revokeObjectURL(url);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
      return;
    }

    if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);

      video.preload = 'metadata';

      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight
        });
        URL.revokeObjectURL(url);
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load video'));
      };

      video.src = url;
      return;
    }

    reject(new Error('Unsupported file type'));
  });
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
