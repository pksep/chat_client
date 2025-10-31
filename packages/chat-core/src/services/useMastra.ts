import { ref, Ref } from 'vue';
import { MastraClient } from '@mastra/client-js';
import { formatTime } from '../composables/useTime';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: string;
}

/** IndexedDB constants */
const DB_NAME = 'chat-messages-db';
const STORE_NAME = 'messages';

/** Open (or create) the IndexedDB database */
function openDB(): Promise<IDBDatabase> {
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

/** Load cached messages for a chat */
async function loadMessages(chatId: string): Promise<Message[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(chatId);
    getRequest.onsuccess = () => {
      const result = getRequest.result;
      resolve(result ? result.messages : []);
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
}

/** Get all stored chats from IndexedDB */
async function getAllChats(): Promise<{ chatId: string; timestamp: Date }[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const getAllRequest = store.getAll();

    getAllRequest.onsuccess = () => {
      const results = getAllRequest.result || [];
      // Convert to array with timestamps for sorting
      const chatsWithTimestamps = results.map((item: any) => ({
        chatId: item.chatId,
        timestamp: item.timestamp ? new Date(item.timestamp) : new Date(0)
      }));
      // Sort by timestamp descending (most recent first)
      chatsWithTimestamps.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );
      resolve(chatsWithTimestamps);
    };
    getAllRequest.onerror = () => reject(getAllRequest.error);
  });
}

/** Deep clone and sanitize messages for storage */
function sanitizeMessages(messages: Message[]): Message[] {
  return messages.map(msg => {
    // Create a plain object without any circular references or non-serializable properties
    return {
      role: msg.role,
      content: msg.content,
      loading: msg.loading,
      timestamp: msg.timestamp
    };
  });
}

/** Persist messages for a chat */
async function saveMessages(
  chatId: string,
  messages: Message[]
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Sanitize messages before storing
    const sanitizedMessages = sanitizeMessages(messages);
    const putRequest = store.put({
      chatId,
      messages: sanitizedMessages,
      timestamp: new Date().toISOString()
    });
    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(putRequest.error);
  });
}

/**
 * Generate a unique chat ID (UUID)
 */
function generateChatId(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

/**
 * Get the last session ID from IndexedDB
 */
async function getLastSessionId(): Promise<string | null> {
  try {
    const chats = await getAllChats();
    return chats.length > 0 ? chats[0].chatId : null;
  } catch (error) {
    console.error('Error getting last session:', error);
    return null;
  }
}

/**
 * Clear all data from the IndexedDB messages store
 */
async function clearAllData(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const clearRequest = store.clear();
    clearRequest.onsuccess = () => {
      resolve();
    };
    clearRequest.onerror = () => {
      reject(clearRequest.error);
    };
  });
}

/**
 * Hook for interacting with Mastra and caching messages per chat.
 *
 * @param agentId  Mastra agent ID (default: 'chat').
 * @param chatId   Unique identifier for the chat (UUID).
 * @param baseUrl  Base URL for Mastra client.
 */
function useMastra(
  agentId: string = 'chat',
  chatId: string | undefined,
  baseUrl: string = import.meta.env.VITE_CHAT_MASTRA_URL ||
    'http://localhost:4111'
) {
  const client = new MastraClient({ baseUrl });

  const messages: Ref<Message[]> = ref([]);

  // State to track if we're waiting for session initialization
  const isInitializing = ref(true);
  let resolvedChatId: string | null = null;

  // Function to initialize the chat session
  const initializeSession = async () => {
    let finalChatId: string;

    if (chatId) {
      // Use provided chat ID
      finalChatId = chatId;
    } else {
      // Try to get last session from IndexedDB
      const lastSessionId = await getLastSessionId();
      if (lastSessionId) {
        finalChatId = lastSessionId;
      } else {
        // Generate new UUID if no session exists
        finalChatId = generateChatId();
      }
    }

    resolvedChatId = finalChatId;

    // Load messages for the determined chat ID
    loadMessages(finalChatId)
      .then(cached => {
        messages.value = cached;
        isInitializing.value = false;
      })
      .catch(() => {
        messages.value = [];
        isInitializing.value = false;
      });
  };

  // Initialize the session
  initializeSession();

  const sendMessage = async (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal
  ) => {
    if (!input.trim()) return;

    // Wait for initialization to complete
    if (isInitializing.value || !resolvedChatId) {
      // Queue the message or return early
      return;
    }

    // Check if last message is an assistant message that is still loading
    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage?.loading) {
      // If assistant is still responding, don't create a new message
      return;
    }

    /* Push user message */
    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: formatTime()
    };
    messages.value.push(userMessage);

    // Store the index of the assistant message we're about to add
    const assistantIndex = messages.value.length;

    /* Push placeholder for assistant */
    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: formatTime()
    };
    messages.value.push(assistantMessage);

    /* Persist after adding messages */
    await saveMessages(resolvedChatId, messages.value);

    try {
      const agent = client.getAgent(agentId);
      if (!agent) throw new Error('Ошибка на стороне сервера, извините');

      const stream = await agent.streamVNext({
        messages: messages.value.map(m => ({
          role: m.role,
          content: m.content
        })),
        abortSignal
      });

      if (!stream) throw new Error('Ошибка на стороне сервера, извините');
      onFinish?.();

      await Promise.race([
        new Promise((resolve, reject) => {
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
                  console.warn(
                    'Unsupported chunk type skipped:',
                    typeof chunk,
                    chunk
                  );
                  return;
                }

                if (event.type === 'text-delta' && event.payload?.text) {
                  // Ensure we're updating the correct assistant message
                  if (assistantIndex < messages.value.length) {
                    messages.value[assistantIndex].content +=
                      event.payload.text;
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
                reject(new Error('Ошибка обработки сообщения'));
              }
            }
          });
        }),
        new Promise(resolve => setTimeout(resolve, 10000)) // 10s fallback
      ]);
    } catch (error: any) {
      if (!error?.message) {
        if (assistantIndex < messages.value.length) {
          messages.value[assistantIndex].content = `Произошла ошибка ${error}`;
        }
      } else if (
        error?.message?.includes('V2 models') ||
        error?.message?.includes('Timeout exceeded')
      ) {
        if (assistantIndex < messages.value.length) {
          messages.value[assistantIndex].content =
            'Данная версия модели не поддерживается, попробуйте с другой';
        }
      } else if (error.status === 500) {
        if (assistantIndex < messages.value.length) {
          messages.value[assistantIndex].content =
            'Наша ошибка, уже чиним - скоро будет готово';
        }
      } else {
        if (assistantIndex < messages.value.length) {
          messages.value[assistantIndex].content =
            'Извините, сервис временно не доступен';
        }
      }
    } finally {
      if (
        assistantIndex < messages.value.length &&
        messages.value[assistantIndex]
      ) {
        messages.value[assistantIndex].loading = false;
      }
      /* Persist after each update */
      await saveMessages(resolvedChatId, messages.value);
    }
  };

  const clearMessages = () => {
    if (!resolvedChatId) return;
    messages.value = [];
    saveMessages(resolvedChatId, messages.value);
  };

  return {
    generateChatId,
    messages,
    sendMessage,
    clearMessages,
    isInitializing
  };
}

/**
 * Save userId to sessionStorage
 */
function saveUserIdToSession(userId: string): void {
  sessionStorage.setItem('userId', userId);
}

/**
 * Check if userId exists in sessionStorage
 */
function hasUserIdInSession(id: string): boolean {
  const userId = sessionStorage.getItem('userId');
  return userId === id;
}

/**
 * Remove loading state from a specific message in the chat history
 */
async function removeMessageLoading(
  chatId: string,
  messageIndex: number
): Promise<void> {
  const messages = await loadMessages(chatId);
  if (
    messageIndex >= 0 &&
    messageIndex < messages.length &&
    messages[messageIndex].loading
  ) {
    messages[messageIndex].loading = false;
    await saveMessages(chatId, messages);
  }
}

export {
  useMastra,
  clearAllData,
  saveUserIdToSession,
  hasUserIdInSession,
  removeMessageLoading
};
