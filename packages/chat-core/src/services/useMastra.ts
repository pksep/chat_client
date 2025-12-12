import { ref, Ref } from 'vue';
import { MastraClient } from '@mastra/client-js';
import {
  saveMessages,
  getOrCreateChatHistory,
  generateChatId
} from './useChatDb';
import { AIMessage } from '../types/messages';
import { getConfig } from './useConfig';

type Message = AIMessage;

interface UseMastraOptions {
  agentId?: string;
  chatId?: string;
  baseUrl?: string;
}

const saveUserIdToSession = (userId: string): void => {
  sessionStorage.setItem('userId', userId);
};

const hasUserIdInSession = (id: string): boolean => {
  const userId = sessionStorage.getItem('userId');
  return userId === id;
};

const useMastra = (options?: UseMastraOptions | false) => {
  if (!options) {
    return {
      messages: ref<Message[]>([]),
      sendMessage: async () => {},
      clearMessages: () => {},
      isInitializing: ref(false)
    };
  }

  const config = getConfig();
  const defaultBaseUrl = config.CHAT_MASTRA_URL;
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
    }
  };

  const clearMessages = () => {
    if (!chatId) return;
    messages.value = [];
    saveMessages(chatId, messages.value);
  };

  return {
    messages,
    sendMessage,
    clearMessages,
    isInitializing
  };
};

export { useMastra, generateChatId, saveUserIdToSession, hasUserIdInSession };
