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
    const putRequest = store.put({ chatId, messages: sanitizedMessages });
    putRequest.onsuccess = () => resolve();
    putRequest.onerror = () => reject(putRequest.error);
  });
}

/**
 * Hook for interacting with Mastra and caching messages per chat.
 *
 * @param chatId   Unique identifier for the chat (UUID).
 * @param agentId  Mastra agent ID (default: 'chat').
 * @param baseUrl  Base URL for Mastra client.
 */
export function useMastra(
  chatId: string,
  agentId: string = 'chat',
  baseUrl: string = import.meta.env.VITE_MASTRA_URL || 'http://localhost:4111'
) {
  const client = new MastraClient({ baseUrl });
  const messages: Ref<Message[]> = ref([]);

  /* Load cached messages on initialization */
  loadMessages(chatId)
    .then(cached => {
      messages.value = cached;
    })
    .catch(() => {
      messages.value = [];
    });

  const sendMessage = async (input: string, abortSignal?: AbortSignal) => {
    if (!input.trim()) return;

    /* Push user message */
    messages.value.push({
      role: 'user',
      content: input,
      timestamp: formatTime()
    });
    const assistantIndex = messages.value.length;

    /* Push placeholder for assistant */
    messages.value.push({
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: formatTime()
    });

    /* Persist after adding messages */
    await saveMessages(chatId, messages.value);

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
                  messages.value[assistantIndex].content += event.payload.text;
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
        messages.value[assistantIndex].content = `Произошла ошибка ${error}`;
      } else if (
        error?.message?.includes('V2 models') ||
        error?.message?.includes('Timeout exceeded')
      ) {
        messages.value[assistantIndex].content =
          'Данная версия модели не поддерживается, попробуйте с другой';
      } else if (error.status === 500) {
        messages.value[assistantIndex].content =
          'Наша ошибка, уже чиним - скоро будет готово';
      } else {
        messages.value[assistantIndex].content =
          'Извините, сервис временно не доступен';
      }
    } finally {
      if (messages.value[assistantIndex]) {
        messages.value[assistantIndex].loading = false;
      }
      /* Persist after each update */
      await saveMessages(chatId, messages.value);
    }
  };

  const clearMessages = () => {
    messages.value = [];
    saveMessages(chatId, messages.value);
  };

  return {
    messages,
    sendMessage,
    clearMessages
  };
}
