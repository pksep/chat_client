import { AIMessage } from '../types/messages';

type Message = AIMessage;

const DB_NAME = 'chat-messages-db';
const DB_VERSION = 2;
const STORE_NAME = 'messages';
const pendingWrites = new Map<string, Promise<void>>();

class ChatDB {
  static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'chatId' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static closeAfterTransaction(db: IDBDatabase, tx: IDBTransaction): void {
    const close = () => db.close();

    tx.addEventListener('complete', close, { once: true });
    tx.addEventListener('abort', close, { once: true });
    tx.addEventListener('error', close, { once: true });
  }

  static async get(chatId: string): Promise<{
    messages: Message[];
    timestamp: string;
    conversationGeneration?: number;
    conversationProtocol?: 0 | 1;
  } | null> {
    if (!chatId || typeof chatId !== 'string') return null;

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      this.closeAfterTransaction(db, tx);
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(chatId);

      request.onsuccess = () => {
        let result = request.result;
        if (result && result.messages && Array.isArray(result.messages)) {
          result = {
            ...result,
            messages: result.messages.map(msg => {
              let timestamp: number | undefined;
              if (typeof msg.timestamp === 'string') {
                timestamp = new Date(msg.timestamp).getTime();
              } else if (typeof msg.timestamp === 'number') {
                timestamp = msg.timestamp;
              } else {
                timestamp = Date.now();
              }
              return {
                ...msg,
                timestamp
              };
            })
          };
        }
        resolve(result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async put(
    chatId: string,
    messages: Message[],
    conversationGeneration?: number,
    conversationProtocol?: 0 | 1
  ): Promise<void> {
    // Снимок фиксируется до первого ожидания: следующий ответ не изменяет
    // уже поставленную запись, а позднее открытие базы не возвращает старую историю.
    const serializableMessages = messages.map(msg => {
      const attachments = msg.attachments?.map(
        ({
          name,
          size,
          contentType,
          transferToken,
          expiresAt,
          attachmentId,
          contentHash
        }) => ({
          ...(attachmentId ? { attachmentId, contentHash } : {}),
          name,
          size,
          contentType,
          transferToken,
          expiresAt
        })
      );
      const outputAttachments = msg.outputAttachments?.map(
        ({ id, name, size, contentType, path, thumbnailPath }) => ({
          id,
          name,
          size,
          contentType,
          path,
          thumbnailPath
        })
      );

      const serializableMessage = {
        ...msg,
        ...(attachments ? { attachments } : {}),
        ...(outputAttachments ? { outputAttachments } : {}),
        timestamp: msg.timestamp
          ? new Date(msg.timestamp).toISOString()
          : undefined
      };

      // IndexedDB не клонирует реактивные Proxy после восстановления истории.
      return JSON.parse(JSON.stringify(serializableMessage)) as Message;
    });
    const data = {
      chatId,
      messages: serializableMessages,
      timestamp: new Date().toISOString()
    };
    const write = (pendingWrites.get(chatId) ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        const db = await this.openDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          this.closeAfterTransaction(db, tx);
          tx.oncomplete = () => resolve();
          tx.onabort = () =>
            reject(tx.error ?? new Error('Не удалось сохранить историю чата.'));
          tx.onerror = () => reject(tx.error);
          const store = tx.objectStore(STORE_NAME);
          const previous = store.get(chatId);
          previous.onsuccess = () => {
            const oldGeneration = previous.result?.conversationGeneration;
            // Другое окно могло уже очистить историю. Старый поток не понижает её версию.
            if (
              conversationGeneration !== undefined &&
              typeof oldGeneration === 'number' &&
              oldGeneration > conversationGeneration
            ) {
              tx.abort();
              return;
            }
            const generation = conversationGeneration ?? oldGeneration;
            const protocol =
              conversationProtocol ??
              (generation === oldGeneration
                ? previous.result?.conversationProtocol
                : undefined);
            store.put({
              ...data,
              ...(typeof generation === 'number'
                ? { conversationGeneration: generation }
                : {}),
              ...(protocol === 0 || protocol === 1
                ? { conversationProtocol: protocol }
                : {})
            });
          };
        });
      });
    pendingWrites.set(chatId, write);
    try {
      await write;
    } finally {
      if (pendingWrites.get(chatId) === write) pendingWrites.delete(chatId);
    }
  }

  static async getAllChats(): Promise<
    Array<{ chatId: string; timestamp: Date }>
  > {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      this.closeAfterTransaction(db, tx);
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        const chats = results.map((item: any) => {
          let timestamp: Date;
          if (typeof item.timestamp === 'string') {
            timestamp = new Date(item.timestamp);
          } else if (item.timestamp instanceof Date) {
            timestamp = item.timestamp;
          } else {
            timestamp = new Date(0);
          }
          return {
            chatId: item.chatId,
            timestamp
          };
        });
        chats.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        resolve(chats);
      };
      request.onerror = () => reject(request.error);
    });
  }

  static async clear(): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      this.closeAfterTransaction(db, tx);
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const loadMessages = async (chatId: string): Promise<Message[]> => {
  try {
    if (!chatId) {
      console.error('Invalid chatId provided to loadMessages:', chatId);
      return [];
    }

    const result = await ChatDB.get(chatId);
    return result?.messages || [];
  } catch (error) {
    console.error('Error loading messages:', error);
    return [];
  }
};

const saveMessages = async (
  chatId: string,
  messages: Message[],
  conversationGeneration?: number,
  conversationProtocol?: 0 | 1
): Promise<void> => {
  try {
    if (!chatId) {
      throw new Error('Invalid chatId provided to saveMessages: ' + chatId);
    }

    await ChatDB.put(
      chatId,
      messages,
      conversationGeneration,
      conversationProtocol
    );
  } catch (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
};

/** Сообщения и версия читаются одной операцией: очистка в другом окне не смешивает два состояния. */
const getChatHistorySnapshot = async (
  chatId: string
): Promise<{
  messages: Message[];
  conversationGeneration?: number;
  conversationProtocol?: 0 | 1;
}> => {
  if (!chatId) throw new Error('Не указан чат для загрузки истории.');
  const stored = await ChatDB.get(chatId);
  return {
    messages: Array.isArray(stored?.messages) ? stored.messages : [],
    conversationGeneration:
      typeof stored?.conversationGeneration === 'number'
        ? stored.conversationGeneration
        : undefined,
    ...(stored?.conversationProtocol === 0 || stored?.conversationProtocol === 1
      ? { conversationProtocol: stored.conversationProtocol }
      : {})
  };
};

/** Версия сохраняется вместе с сообщениями, поэтому перезагрузка не восстанавливает очищенный диалог. */
const getChatHistoryGeneration = async (
  chatId: string
): Promise<number | undefined> => {
  const stored = await ChatDB.get(chatId);
  return typeof stored?.conversationGeneration === 'number'
    ? stored.conversationGeneration
    : undefined;
};

const getOrCreateChatHistory = async (chatId: string): Promise<Message[]> => {
  try {
    if (!chatId) {
      console.error(
        'Invalid chatId provided to getOrCreateChatHistory:',
        chatId
      );
      return [];
    }

    const result = await ChatDB.get(chatId);
    if (result && result.messages && Array.isArray(result.messages)) {
      return result.messages;
    }
    await ChatDB.put(chatId, []);
    return [];
  } catch (error) {
    console.error('Error in getOrCreateChatHistory:', error);
    return [];
  }
};

const getAllChats = async (): Promise<
  Array<{ chatId: string; timestamp: Date }>
> => {
  try {
    return await ChatDB.getAllChats();
  } catch (error) {
    console.error('Error getting all chats:', error);
    return [];
  }
};

const getLastSessionId = async (): Promise<string | null> => {
  try {
    const chats = await getAllChats();
    return chats.length > 0 ? chats[0].chatId : null;
  } catch (error) {
    console.error('Error getting last session:', error);
    return null;
  }
};

const clearAllData = async (): Promise<void> => {
  try {
    await ChatDB.clear();
  } catch (error) {
    console.error('Error clearing data:', error);
    throw error;
  }
};

const removeMessageLoading = async (
  chatId: string,
  messageIndex: number
): Promise<void> => {
  if (!chatId) {
    console.error('Invalid chatId provided to removeMessageLoading:', chatId);
    return;
  }

  const { messages, conversationGeneration } =
    await getChatHistorySnapshot(chatId);
  if (
    messageIndex >= 0 &&
    messageIndex < messages.length &&
    messages[messageIndex].loading
  ) {
    messages[messageIndex].loading = false;
    await saveMessages(chatId, messages, conversationGeneration ?? 0);
  }
};

const useChatDb = () => {
  return {
    loadMessages,
    saveMessages,
    getOrCreateChatHistory,
    getChatHistorySnapshot,
    getAllChats,
    getLastSessionId,
    clearAllData,
    removeMessageLoading
  };
};

export {
  useChatDb,
  loadMessages,
  saveMessages,
  getOrCreateChatHistory,
  getChatHistorySnapshot,
  getChatHistoryGeneration,
  getAllChats,
  getLastSessionId,
  clearAllData,
  removeMessageLoading
};
