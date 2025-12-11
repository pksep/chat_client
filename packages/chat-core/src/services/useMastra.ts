import { ref, Ref } from 'vue';
import { MastraClient } from '@mastra/client-js';
import { getConfig } from './useConfig';
import crypto from "crypto";

interface Message {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: number;
}

interface UseMastraOptions {
  agentId?: string;
  chatId?: string;
  baseUrl?: string;
}

// IndexedDB constants
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
          // Create new result object with properly formatted timestamps
          result = {
            ...result,
            messages: result.messages.map(msg => {
              let timestamp: number | undefined;
              if (typeof msg.timestamp === 'string') {
                // Convert stored string timestamp back to number
                timestamp = new Date(msg.timestamp).getTime();
              } else if (typeof msg.timestamp === 'number') {
                // Timestamp is already a number
                timestamp = msg.timestamp;
              } else {
                // Default to current time if no timestamp
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
      // Ensure all data is serializable by converting any Date objects to ISO strings
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
          // Handle both string and Date object timestamps
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
        // Sort by timestamp (newest first)
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
    await ChatDB.put(chatId, messages);
  } catch (error) {
    console.error('Error saving messages:', error);
    throw error;
  }
};

const getOrCreateChatHistory = async (chatId: string): Promise<Message[]> => {
  try {
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

const saveUserIdToSession = (userId: string): void => {
  sessionStorage.setItem('userId', userId);
};

const hasUserIdInSession = (id: string): boolean => {
  const userId = sessionStorage.getItem('userId');
  return userId === id;
};

const removeMessageLoading = async (
  chatId: string,
  messageIndex: number
): Promise<void> => {
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

const useMastra = (options?: UseMastraOptions | false) => {
  if (!options) {
    return {
      generateChatId,
      messages: ref<Message[]>([]),
      sendMessage: async () => {},
      clearMessages: () => {},
      isInitializing: ref(false)
    };
  }

  const config = getConfig();
  const defaultBaseUrl = config.CHAT_MASTRA_URL;
  const agentId = options.agentId ?? 'chat';
  let chatId = options.chatId; // Use 'let' to allow reassignment
  const baseUrl = options.baseUrl ?? defaultBaseUrl;

  const client = new MastraClient({ baseUrl });
  const messages: Ref<Message[]> = ref([]);
  const isInitializing = ref(!!chatId); // Only true if chatId exists initially

  // Initialize if chatId is available
  if (chatId) {
    getOrCreateChatHistory(chatId)
      .then(initialMessages => {
        messages.value = [...initialMessages];
        isInitializing.value = false;
      })
      .catch(() => {
        messages.value = [];
        isInitializing.value = false;
      });
  } else {
    isInitializing.value = false; // If no chatId, skip initialization but allow later
  }

  const sendMessage = async (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal
  ) => {
    if (!input.trim()) return;

    // If no chatId, generate one now (first message case)
    if (!chatId) {
      chatId = generateChatId();
      // Initialize with empty messages for new chat
      messages.value = [];
      isInitializing.value = false;
    }

    if (isInitializing.value) return;

    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage?.loading) {
      return;
    }

    // Add user message and ensure reactivity
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };
    messages.value = [...messages.value, userMessage];

    // Add loading assistant message and ensure reactivity
    const assistantIndex = messages.value.length;
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: Date.now()
    };
    messages.value = [...messages.value, assistantMessage];

    // Save messages after adding both user and assistant messages
    await saveMessages(chatId, messages.value);

    try {
      const agent = client.getAgent(agentId);
      if (!agent) throw new Error('Server error, sorry');

      const stream = await agent.streamVNext({
        messages: messages.value.map(m => ({
          role: m.role,
          content: m.content
        })),
        abortSignal
      });

      if (!stream) throw new Error('Server error, sorry');
      onFinish?.();

      await new Promise((resolve, reject) => {
        stream.processDataStream({
          onChunk: (chunk: string | object): Promise<void> => {
            try {
              let event: any;
              if (typeof chunk === 'object' && chunk !== null) {
                event = chunk;
              } else if (typeof chunk === 'string') {
                let jsonStr = chunk;
                if (jsonStr.startsWith('data: ')) {
                  jsonStr = jsonStr.slice(6).trim();
                }
                event = JSON.parse(jsonStr);
              } else {
                return;
              }

              if (event.type === 'text-delta' && event.payload?.text) {
                if (assistantIndex < messages.value.length) {
                  // Create a new array with updated message to ensure reactivity
                  const newMessages = [...messages.value];
                  newMessages[assistantIndex] = {
                    ...newMessages[assistantIndex],
                    content:
                      newMessages[assistantIndex].content + event.payload.text
                  };
                  messages.value = newMessages;
                }
              } else if (event.type === 'finish') {
                resolve(null);
              }
            } catch (parseError) {
              console.error(
                'Chunk parsing failed:',
                parseError,
                'Chunk:',
                chunk
              );
              reject(new Error('Message processing error'));
            }
          }
        });
      });
    } catch (error: any) {
      let errorMessage = 'Service temporarily unavailable';
      if (!error?.message) {
        errorMessage = `An error occurred ${error}`;
      } else if (
        error?.message?.includes('V2 models') ||
        error?.message?.includes('Timeout exceeded')
      ) {
        errorMessage =
          'This model version is not supported, please try another';
      } else if (error.status === 500) {
        errorMessage = 'Our error, fixing it now - will be ready soon';
      }

      if (assistantIndex < messages.value.length) {
        const newMessages = [...messages.value];
        newMessages[assistantIndex] = {
          ...newMessages[assistantIndex],
          content: errorMessage
        };
        messages.value = newMessages;
      }
    } finally {
      if (
        assistantIndex < messages.value.length &&
        messages.value[assistantIndex]
      ) {
        // Remove loading state with new array to ensure reactivity
        const newMessages = [...messages.value];
        newMessages[assistantIndex] = {
          ...newMessages[assistantIndex],
          loading: false
        };
        messages.value = newMessages;
      }
      if (chatId) {
        await saveMessages(chatId, messages.value);
      }
    }
  };

  const clearMessages = () => {
    if (!chatId) return;
    messages.value = [];
    saveMessages(chatId, messages.value);
  };

  return {
    generateChatId,
    messages,
    sendMessage,
    clearMessages,
    isInitializing
  };
};

export {
  useMastra,
  clearAllData,
  generateChatId,
  getLastSessionId,
  getOrCreateChatHistory,
  saveUserIdToSession,
  hasUserIdInSession,
  removeMessageLoading,
  loadMessages,
  saveMessages
};
