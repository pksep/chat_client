import { AIMessage } from '../types/messages';

type Message = AIMessage;

const DB_NAME = 'chat-messages-db';
const STORE_NAME = 'messages';

class ChatDB {
  static async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'chatId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async get(
    chatId: string
  ): Promise<{ messages: Message[]; timestamp: string } | null> {
    if (!chatId || typeof chatId !== 'string') return null;

    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
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

  static async put(chatId: string, messages: Message[]): Promise<void> {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const serializableMessages = messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp
          ? new Date(msg.timestamp).toISOString()
          : undefined
      }));
      const data = {
        chatId,
        messages: serializableMessages,
        timestamp: new Date().toISOString()
      };
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  static async getAllChats(): Promise<
    Array<{ chatId: string; timestamp: Date }>
  > {
    const db = await this.openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
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
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

const generateChatId = (): string => {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
};

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
  messages: Message[]
): Promise<void> => {
  try {
    if (!chatId) {
      throw new Error('Invalid chatId provided to saveMessages: ' + chatId);
    }

    await ChatDB.put(chatId, messages);
  } catch (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
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

  const messages = await loadMessages(chatId);
  if (
    messageIndex >= 0 &&
    messageIndex < messages.length &&
    messages[messageIndex].loading
  ) {
    messages[messageIndex].loading = false;
    await saveMessages(chatId, messages);
  }
};

const useChatDb = () => {
  return {
    generateChatId,
    loadMessages,
    saveMessages,
    getOrCreateChatHistory,
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
  getAllChats,
  getLastSessionId,
  clearAllData,
  removeMessageLoading,
  generateChatId
};
