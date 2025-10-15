import { ref, Ref } from 'vue';
import { MastraClient } from '@mastra/client-js';
import { formatTime } from '../composables/useTime';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  loading?: boolean;
  timestamp?: string;
}

export function useMastra(
  agentId: string = 'chat',
  baseUrl: string = import.meta.env.VITE_MASTRA_URL || 'http://localhost:4111'
) {
  const client = new MastraClient({ baseUrl });
  const messages: Ref<Message[]> = ref([]);

  const sendMessage = async (input: string, abortSignal?: AbortSignal) => {
    if (!input.trim()) return;

    messages.value.push({
      role: 'user',
      content: input,
      timestamp: formatTime()
    });
    const assistantIndex = messages.value.length;
    messages.value.push({
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: formatTime()
    });

    try {
      const agent = client.getAgent(agentId);

      if (!agent) {
        throw new Error('Ошибка на стороне сервера, извините');
      }

      const stream = await agent.streamVNext({
        messages: messages.value.map(m => ({
          role: m.role,
          content: m.content
        })),
        abortSignal
      });

      if (!stream) {
        throw new Error('Ошибка на стороне сервера, извините');
      }

      await Promise.race([
        new Promise((resolve, reject) => {
          stream.processDataStream({
            onChunk: (chunk): Promise<void> => {
              try {
                // console.log('Raw chunk received:', chunk, typeof chunk); // Debug: log raw chunk and type

                let event: any;
                if (typeof chunk === 'object' && chunk !== null) {
                  event = chunk;
                  console.log('Using object chunk as event:', event.type);
                } else if (typeof chunk === 'string') {
                  let jsonStr = chunk as string;
                  if (jsonStr.startsWith('data: ')) {
                    jsonStr = jsonStr.slice(6).trim();
                  }
                  event = JSON.parse(jsonStr);
                  console.log('Parsed event type:', event.type);
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
        new Promise(resolve => setTimeout(resolve, 10000)) // 10s timeout fallback
      ]);
    } catch (error: any) {
      if (!error?.message) {
        messages.value[assistantIndex].content = `Произошла ошибка ${error}`;
      }
      if (
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
    }
  };

  const clearMessages = () => {
    messages.value = [];
  };

  return {
    messages,
    sendMessage,
    clearMessages
  };
}
