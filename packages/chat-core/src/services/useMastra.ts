import { ref, Ref } from 'vue';
import { MastraClient } from '@mastra/client-js';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useMastra(
  agentId: string = 'chat',
  baseUrl: string = import.meta.env.VITE_MASTRA_URL || 'http://localhost:4111'
) {
  const client = new MastraClient({ baseUrl });
  const messages: Ref<Message[]> = ref([]);
  const loading = ref(false);

  const sendMessage = async (input: string, abortSignal?: AbortSignal) => {
    if (!input.trim()) return;

    messages.value.push({ role: 'user', content: input });
    const assistantIndex = messages.value.length;
    messages.value.push({ role: 'assistant', content: '' });

    loading.value = true;

    try {
      const agent = client.getAgent(agentId);

      // Use streamVNext for V2 model compatibility (replaces legacy .stream())
      const stream = await agent.streamVNext({
        messages: messages.value.map(m => ({
          role: m.role,
          content: m.content
        })),
        abortSignal // Optional: for canceling the stream
      });

      await Promise.race([
        new Promise((resolve, reject) => {
          stream.processDataStream({
            onChunk: (chunk: any) => {
              try {
                console.log('Raw chunk received:', chunk, typeof chunk); // Debug: log raw chunk and type

                let event: any;
                if (typeof chunk === 'object' && chunk !== null) {
                  // Already parsed object - use directly
                  event = chunk;
                  console.log('Using object chunk as event:', event.type);
                } else if (typeof chunk === 'string') {
                  let jsonStr = chunk.trim();
                  if (jsonStr.startsWith('data: ')) {
                    jsonStr = jsonStr.slice(6).trim();
                  }

                  // Skip SSE terminators, empty, or non-JSON
                  if (
                    jsonStr === '[DONE]' ||
                    jsonStr === '' ||
                    jsonStr === 'data: [DONE]'
                  ) {
                    console.log('Skipped terminator chunk:', jsonStr);
                    return; // End of stream
                  }
                  if (!jsonStr.startsWith('{') && !jsonStr.startsWith('[')) {
                    console.warn('Non-JSON chunk skipped:', jsonStr);
                    return;
                  }

                  // Parse valid JSON event (Mastra vNext format)
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
                  console.log('Appended text-delta:', event.payload.text);
                } else if (event.type === 'finish') {
                  console.log('Detected finish event');
                  resolve(null);
                } else {
                  console.log('Ignored event type:', event.type); // Debug: log ignored types like reasoning-delta
                }
                // Ignore other events like reasoning-delta, start
              } catch (parseError) {
                console.warn('Failed to parse chunk:', parseError, chunk);
              }
            },
            onError: (error: Error) => {
              reject(error);
            }
          });
        }),
        new Promise(resolve => setTimeout(resolve, 10000)) // 10s timeout fallback
      ]);
    } catch (error: any) {
      console.error('Error sending message:', error);

      // More specific error handling based on Mastra errors – update array directly
      if (error.message?.includes('V2 models')) {
        messages.value[assistantIndex].content =
          'Error: Please ensure your Mastra agent uses a V2-compatible model. Try updating to streamVNext in your server config.';
      } else if (error.status === 500) {
        messages.value[assistantIndex].content =
          'Server error. Check your Mastra server logs and try again.';
      } else {
        messages.value[assistantIndex].content =
          'Sorry, there was an error generating the response. Please try again.';
      }
    } finally {
      loading.value = false;
    }
  };

  const clearMessages = () => {
    messages.value = [];
  };

  return {
    messages,
    loading,
    sendMessage,
    clearMessages
  };
}
