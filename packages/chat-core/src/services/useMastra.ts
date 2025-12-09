import { ref, Ref } from 'vue';
import { MastraClient } from '@mastra/client-js';

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

  const defaultBaseUrl =
    import.meta.env.VITE_CHAT_MASTRA_URL || 'http://localhost:4111';
  const agentId = options.agentId ?? 'chat';
  let chatId = options.chatId;
  const baseUrl = options.baseUrl ?? defaultBaseUrl;

  const client = new MastraClient({ baseUrl });
  const messages: Ref<Message[]> = ref([]);
  const isInitializing = ref(!!chatId);

  if (chatId) {
    getOrCreateChatHistory(chatId)
      .then(initialMessages => {
        messages.value = [...initialMessages];
        isInitializing.value = false;
      })
      .catch(error => {
        console.error('Failed to get messages for conversation:', error);
        messages.value = [];
        isInitializing.value = false;
      });
  } else {
    isInitializing.value = false;
  }

  const sendMessage = async (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal
  ) => {
    if (!input.trim()) return;

    if (!chatId) {
      chatId = generateChatId();
      messages.value = [];
      isInitializing.value = false;
    }

    if (isInitializing.value) return;

    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage?.loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now()
    };
    messages.value = [...messages.value, userMessage];

    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: Date.now()
    };
    messages.value = [...messages.value, assistantMessage];

    await saveMessages(chatId, messages.value);

    const assistantMessageIndex = messages.value.length - 1;

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

      const streamProcessingPromise = new Promise((resolve, reject) => {
        let isResolved = false;

        const processStream = async () => {
          try {
            await stream.processDataStream({
              onChunk: async (chunk: string | object) => {
                try {
                  let event: any;
                  if (
                    typeof chunk === 'object' &&
                    chunk !== null &&
                    !Array.isArray(chunk)
                  ) {
                    // Direct object processing
                    event = chunk;
                  } else if (typeof chunk === 'string') {
                    let jsonStr = chunk;
                    if (jsonStr.startsWith('data: ')) {
                      jsonStr = jsonStr.slice(6).trim();
                    }

                    if (jsonStr === '[DONE]') {
                      console.debug('Stream processing completed', jsonStr);
                      if (!isResolved) {
                        isResolved = true;
                        resolve(null);
                      }
                      return;
                    }

                    try {
                      event = JSON.parse(jsonStr);
                    } catch (e) {
                      console.error('Failed to parse JSON chunk:', jsonStr);
                      return;
                    }
                  } else {
                    console.debug(
                      'Received unsupported chunk type:',
                      typeof chunk
                    );
                    return;
                  }

                  if (event.type === 'step-finish') {
                    if (assistantMessageIndex < messages.value.length) {
                      const newMessages = [...messages.value];
                      newMessages[assistantMessageIndex] = {
                        ...newMessages[assistantMessageIndex],
                        loading: false
                      };
                      messages.value = newMessages;

                      // Save the updated messages
                      await saveMessages(chatId, messages.value);
                    }
                    // Don't set isResolved here as it will prevent further processing
                    return;
                  }

                  if (event.type === 'text-delta' && event.payload?.text) {
                    if (assistantMessageIndex < messages.value.length) {
                      const newMessages = [...messages.value];
                      newMessages[assistantMessageIndex] = {
                        ...newMessages[assistantMessageIndex],
                        content:
                          newMessages[assistantMessageIndex].content +
                          event.payload.text
                      };
                      messages.value = newMessages;

                      await saveMessages(chatId, messages.value);
                    }
                  } else if (event.type === 'finish') {
                    if (!isResolved) {
                      isResolved = true;
                      resolve(null);
                    }
                  } else if (event.type === 'error') {
                    if (!isResolved) {
                      isResolved = true;
                      let errorMessage =
                        event.payload?.message || 'Stream error occurred';
                      if (errorMessage?.includes('V2 models')) {
                        errorMessage =
                          'This model version is not supported, please try another';
                      } else if (errorMessage?.includes('Timeout exceeded')) {
                        errorMessage = 'Request timed out, please try again';
                      } else if (errorMessage?.includes('Network Error')) {
                        errorMessage =
                          'Network connection issue, please check your connection';
                      }

                      reject(new Error(errorMessage));
                    }
                  }
                } catch (parseError) {
                  console.error('Error processing chunk:', parseError);
                  if (!isResolved) {
                    isResolved = true;
                    let errorMessage = 'Message processing error';
                    if (parseError?.message?.includes('Unexpected token')) {
                      errorMessage =
                        'Error parsing server response, please try again';
                    } else if (parseError?.message?.includes('Network Error')) {
                      errorMessage =
                        'Network connection issue, please check your connection';
                    }

                    reject(new Error(errorMessage));
                  }
                }
              }
            });
          } catch (streamError) {
            if (!isResolved) {
              isResolved = true;
              reject(new Error('Stream processing error'));
            }
          }
        };

        processStream().catch(err => {
          if (!isResolved) {
            isResolved = true;
            let errorMessage = 'Stream processing error';
            if (err?.message?.includes('V2 models')) {
              errorMessage =
                'This model version is not supported, please try another';
            } else if (err?.message?.includes('Timeout exceeded')) {
              errorMessage = 'Request timed out, please try again';
            } else if (err?.message?.includes('Network Error')) {
              errorMessage =
                'Network connection issue, please check your connection';
            }

            reject(new Error(errorMessage));
          }
        });
      });

      await Promise.race([
        streamProcessingPromise,
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error('Request timed out, please try again'));
          }, 60000)
        )
      ]);
    } catch (error: any) {
      let errorMessage = 'Service temporarily unavailable';
      if (!error?.message) {
        errorMessage = `An error occurred: ${error}`;
      } else if (error?.message?.includes('V2 models')) {
        errorMessage =
          'This model version is not supported, please try another';
      } else if (error?.message?.includes('Timeout exceeded')) {
        errorMessage = 'Request timed out, please try again';
      } else if (error.status === 500) {
        errorMessage = 'Server error, fixing it now - will be ready soon';
      } else if (error?.message?.includes('Network Error')) {
        errorMessage = 'Network connection issue, please check your connection';
      } else if (
        error?.message?.includes('401') ||
        error?.message?.includes('Unauthorized')
      ) {
        errorMessage = 'Authentication failed, please log in again';
      } else if (error?.message?.includes('403')) {
        errorMessage = 'Access forbidden, please contact support';
      } else if (error?.message?.includes('429')) {
        errorMessage = 'Too many requests, please try again later';
      } else {
        errorMessage = error.message;
      }

      if (assistantMessageIndex < messages.value.length) {
        const newMessages = [...messages.value];
        newMessages[assistantMessageIndex] = {
          ...newMessages[assistantMessageIndex],
          content: errorMessage
        };
        messages.value = newMessages;
      }
    } finally {
      if (assistantMessageIndex < messages.value.length) {
        const newMessages = [...messages.value];
        newMessages[assistantMessageIndex] = {
          ...newMessages[assistantMessageIndex],
          loading: false
        };
        messages.value = newMessages;
      }
      if (chatId) {
        await saveMessages(chatId, messages.value);
      }

      // Ensure the stream is closed properly if it has a close method
      // Only attempt to close if the stream exists and provides a close method
      if (stream && typeof stream.close === 'function') {
        try {
          stream.close();
        } catch (closeError) {
          console.error('Error closing stream:', closeError);
        }
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
