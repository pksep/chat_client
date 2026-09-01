import { ref, type Ref } from 'vue';
import { MastraClient, RequestContext } from '@mastra/client-js';
import { saveMessages, getOrCreateChatHistory } from './useChatDb';
import { AIMessage, type AIMessageReference } from '../types/messages';
import { getConfig } from './useConfig';
import { generateUUID } from '../utils/generateUUID';
import { getAuthToken } from '../composables/useLogin';
import {
  type ApprovalDecision,
  formatApprovalMessage,
  isStaleApprovalResponse,
  type PendingToolApproval
} from './mastraApproval';
import { processMastraEventStream } from './mastraEventStream';
import type { AiAttachmentReference } from './aiAttachments';

type Message = AIMessage;

interface UseMastraOptions {
  agentId?: string;
  chatId?: string;
  baseUrl?: string;
  approvalMode?: Ref<'ask' | 'automatic'>;
}

interface ToolApprovalRequestError extends Error {
  status: number;
  stale: boolean;
}

const useMastra = (options?: UseMastraOptions | false) => {
  if (!options) {
    return {
      messages: ref<Message[]>([]),
      sendMessage: async () => {},
      resolveToolApproval: async () => {},
      clearMessages: async () => {},
      toggleMessagePin: async () => {},
      deleteMessages: async () => {},
      editMessageAndResend: async () => {},
      appendExternalMessage: async () => {},
      isInitializing: ref(false),
      pendingApproval: ref<PendingToolApproval | null>(null)
    };
  }

  const config = getConfig();
  const defaultBaseUrl = config.CHAT_MASTRA_URL;
  const agentId = options.agentId ?? 'chat';
  let chatId = options.chatId;
  const baseUrl = options.baseUrl ?? defaultBaseUrl;

  const messages: Ref<Message[]> = ref([]);
  const isInitializing = ref(!!chatId);
  const pendingApproval = ref<PendingToolApproval | null>(null);
  let initializationPromise: Promise<void> = Promise.resolve();

  let activeAttachments: AiAttachmentReference[] = [];

  /** Оставляет только неистёкшие вложения, нужные для запроса или его подтверждения. */
  const getActiveAttachments = (): AiAttachmentReference[] => {
    activeAttachments = activeAttachments.filter(
      attachment => attachment.expiresAt > Date.now()
    );
    return activeAttachments;
  };

  const createRequestContext = (
    attachments: AiAttachmentReference[] = getActiveAttachments(),
    forceStrictApproval = false
  ): RequestContext<unknown> => {
    const requestContext = new RequestContext<Record<string, unknown>>();
    requestContext.set(
      'approvalMode',
      !forceStrictApproval && options.approvalMode?.value === 'automatic'
        ? 'automatic'
        : 'strict'
    );
    requestContext.set(
      'attachments',
      attachments.map(({ name, size, contentType, transferToken }) => ({
        name,
        size,
        contentType,
        transferToken
      }))
    );
    if (chatId) requestContext.set('threadId', chatId);
    return requestContext as unknown as RequestContext<unknown>;
  };

  const requestToolApproval = async (
    approval: PendingToolApproval,
    decision: Exclude<ApprovalDecision, null>,
    token: string,
    abortSignal?: AbortSignal,
    attachments: AiAttachmentReference[] = getActiveAttachments()
  ): Promise<Response> => {
    const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
    const apiBaseUrl = normalizedBaseUrl.endsWith('/api')
      ? normalizedBaseUrl
      : `${normalizedBaseUrl}/api`;
    const action =
      decision === 'approve' ? 'approve-tool-call' : 'decline-tool-call';
    const response = await fetch(
      `${apiBaseUrl}/agents/${encodeURIComponent(agentId)}/${action}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          runId: approval.runId,
          toolCallId: approval.toolCallId,
          ...(decision === 'decline'
            ? { reason: 'Пользователь отменил действие в чате.' }
            : {}),
          requestContext: {
            approvalMode:
              options.approvalMode?.value === 'automatic'
                ? 'automatic'
                : 'strict',
            ...(chatId ? { threadId: chatId } : {}),
            attachments: attachments.map(
              ({ name, size, contentType, transferToken }) => ({
                name,
                size,
                contentType,
                transferToken
              })
            )
          }
        }),
        signal: abortSignal
      }
    );

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');
      const stale = isStaleApprovalResponse(responseBody);
      const error = new Error(
        stale
          ? 'Подтверждение устарело после обновления сервиса'
          : 'Не удалось применить решение по действию'
      ) as ToolApprovalRequestError;
      Object.assign(error, { status: response.status, stale });
      throw error;
    }

    return response;
  };

  if (chatId) {
    initializationPromise = getOrCreateChatHistory(chatId)
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

  const submitMessage = async (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    approvalDecisionOverride: Exclude<ApprovalDecision, null> | null = null,
    appendUserMessage = true,
    attachments: AiAttachmentReference[] = [],
    replyTo?: AIMessageReference
  ) => {
    if (!input.trim()) return;

    if (!chatId) {
      chatId = generateUUID();
      messages.value = [];
      isInitializing.value = false;
    }

    if (isInitializing.value) await initializationPromise;

    if (attachments.length > 0) activeAttachments = [...attachments];
    const requestAttachments = getActiveAttachments();

    const lastMessage = messages.value[messages.value.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage?.loading) return;

    if (appendUserMessage) {
      const userMessage: Message = {
        role: 'user',
        content: input,
        timestamp: Date.now(),
        ...(replyTo ? { replyTo } : {})
      };
      messages.value = [...messages.value, userMessage];
    }

    const approvalDecision = pendingApproval.value
      ? approvalDecisionOverride
      : null;

    if (pendingApproval.value && !approvalDecision) {
      const reminderMessage: Message = {
        role: 'assistant',
        content:
          'Сейчас ожидается решение по действию. Выберите «Подтвердить» или «Отменить» на карточке.',
        loading: false,
        timestamp: Date.now()
      };
      messages.value = [...messages.value, reminderMessage];
      await saveMessages(chatId, messages.value);
      return;
    }

    const requestMessages = messages.value
      .filter(message => !message.loading && message.content.trim())
      .map(message => {
        const content = message.replyTo
          ? `${message.content}\n\nКонтекст ответа:\n${
              message.replyTo.role === 'user' ? 'Пользователь' : 'Ассистент'
            }: ${message.replyTo.content}`
          : message.content;

        return message.role === 'user'
          ? { role: 'user' as const, content }
          : { role: 'assistant' as const, content };
      });

    if (requestAttachments.length > 0) {
      const lastUserMessageIndex = requestMessages.findLastIndex(
        message => message.role === 'user'
      );
      if (lastUserMessageIndex >= 0) {
        const manifest = requestAttachments
          .map(
            (attachment, index) =>
              `${index + 1}. ${attachment.name} (${attachment.contentType}, ${attachment.size} байт)`
          )
          .join('\n');
        requestMessages[lastUserMessageIndex] = {
          ...requestMessages[lastUserMessageIndex],
          content: `${requestMessages[lastUserMessageIndex].content}\n\nДоступные вложения текущего запроса:\n${manifest}`
        };
      }
    }

    const assistantMessage: Message = {
      role: 'assistant',
      content: '',
      loading: true,
      timestamp: Date.now()
    };
    const assistantMessageIndex = messages.value.length;
    messages.value = [...messages.value, assistantMessage];

    await saveMessages(chatId, messages.value);

    try {
      const token = getAuthToken();
      if (!token) throw new Error('Authentication required');

      const client = new MastraClient({
        baseUrl,
        headers: {
          Authorization: `Bearer ${token}`
        },
        abortSignal
      });
      const agent = client.getAgent(agentId);
      if (!agent) throw new Error('Server error, sorry');

      let stream;

      if (pendingApproval.value && approvalDecision) {
        const approval = pendingApproval.value;
        pendingApproval.value = null;

        try {
          stream = await requestToolApproval(
            approval,
            approvalDecision,
            token,
            abortSignal,
            requestAttachments
          );
        } catch (approvalError) {
          const requestError =
            approvalError as Partial<ToolApprovalRequestError>;

          if (!requestError.stale) {
            pendingApproval.value = approval;
            throw approvalError;
          }

          if (approvalDecision === 'decline') {
            throw new Error(
              'Действие уже не ожидает подтверждения и не было выполнено.'
            );
          }

          stream = await agent.stream(
            [
              ...requestMessages,
              {
                role: 'user' as const,
                content:
                  'Предыдущее подтверждение устарело после перезапуска сервиса. Повтори последнее запрошенное действие через доступный инструмент, чтобы платформа сформировала новое подтверждение.'
              }
            ],
            {
              requestContext: createRequestContext(requestAttachments, true)
            }
          );
        }
      } else {
        stream = await agent.stream(requestMessages, {
          requestContext: createRequestContext(requestAttachments)
        });
      }

      if (!stream) throw new Error('Server error, sorry');
      onFinish?.();

      const streamProcessingPromise = new Promise((resolve, reject) => {
        let isResolved = false;

        const processStream = async () => {
          try {
            await processMastraEventStream(stream, async event => {
              try {
                if (event.type === 'step-finish') {
                  return;
                }

                if (
                  ['tool-result', 'tool-output'].includes(event.type || '') &&
                  event.payload?.toolName ===
                    'erp_actions_erp_attachment_upload_and_attach'
                ) {
                  activeAttachments = [];
                }

                if (event.type === 'tool-call-approval') {
                  const { payload } = event;

                  if (
                    typeof event.runId === 'string' &&
                    typeof payload?.toolCallId === 'string' &&
                    typeof payload?.toolName === 'string'
                  ) {
                    pendingApproval.value = {
                      runId: event.runId,
                      toolCallId: payload.toolCallId,
                      toolName: payload.toolName,
                      args:
                        payload.args && typeof payload.args === 'object'
                          ? payload.args
                          : {}
                    };

                    if (assistantMessageIndex < messages.value.length) {
                      const newMessages = [...messages.value];
                      newMessages[assistantMessageIndex] = {
                        ...newMessages[assistantMessageIndex],
                        content: formatApprovalMessage(pendingApproval.value),
                        loading: false
                      };
                      messages.value = newMessages;

                      await saveMessages(chatId, messages.value);
                    }
                  }

                  if (!isResolved) {
                    isResolved = true;
                    resolve(null);
                  }
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
            });
            if (!isResolved) {
              isResolved = true;
              resolve(null);
            }
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
          content: errorMessage,
          role: 'assistant',
          loading: false
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

  const sendMessage = async (
    input: string,
    onFinish?: () => void,
    abortSignal?: AbortSignal,
    attachments: AiAttachmentReference[] = [],
    replyTo?: AIMessageReference
  ) =>
    submitMessage(
      input,
      onFinish,
      abortSignal,
      null,
      true,
      attachments,
      replyTo
    );

  const resolveToolApproval = async (
    decision: Exclude<ApprovalDecision, null>,
    onFinish?: () => void,
    abortSignal?: AbortSignal
  ) => {
    if (!pendingApproval.value) return;

    const command = decision === 'approve' ? 'подтверждаю' : 'отмена';
    if (decision === 'decline') activeAttachments = [];
    return submitMessage(command, onFinish, abortSignal, decision, false);
  };

  const clearMessages = async (): Promise<void> => {
    if (!chatId) return;
    if (isInitializing.value) await initializationPromise;
    pendingApproval.value = null;
    activeAttachments = [];
    messages.value = [];
    await saveMessages(chatId, messages.value);
  };

  /** Сохраняет новое состояние локальной истории после действий над AI-сообщениями. */
  const replaceMessages = async (nextMessages: Message[]): Promise<void> => {
    if (!chatId) return;
    if (isInitializing.value) await initializationPromise;

    messages.value = nextMessages;
    await saveMessages(chatId, messages.value);
  };

  /** Меняет признак закрепления выбранного AI-сообщения. */
  const toggleMessagePin = async (messageIndex: number): Promise<void> => {
    const message = messages.value[messageIndex];
    if (!message) return;

    const nextMessages = [...messages.value];
    nextMessages[messageIndex] = {
      ...message,
      pinned: !message.pinned
    };
    await replaceMessages(nextMessages);
  };

  /** Удаляет выбранные сообщения только из текущей локальной AI-истории. */
  const deleteMessages = async (messageIndexes: number[]): Promise<void> => {
    const indexes = new Set(messageIndexes);
    if (indexes.size === 0) return;

    await replaceMessages(
      messages.value.filter((_, index) => !indexes.has(index))
    );
  };

  /** Заменяет пользовательский запрос и заново строит продолжение диалога. */
  const editMessageAndResend = async (
    messageIndex: number,
    input: string,
    replyTo?: AIMessageReference
  ): Promise<void> => {
    const message = messages.value[messageIndex];
    if (!message || message.role !== 'user' || !input.trim()) return;

    pendingApproval.value = null;
    activeAttachments = [];
    await replaceMessages(messages.value.slice(0, messageIndex));
    await submitMessage(input, undefined, undefined, null, true, [], replyTo);
  };

  /** Добавляет результат фоновой автоматизации один раз и сохраняет его в истории. */
  const appendExternalMessage = async (message: Message): Promise<void> => {
    if (!chatId || !message.sourceId) return;
    await initializationPromise;
    if (messages.value.some(item => item.sourceId === message.sourceId)) return;
    messages.value = [...messages.value, message];
    await saveMessages(chatId, messages.value);
  };

  return {
    messages,
    sendMessage,
    resolveToolApproval,
    clearMessages,
    toggleMessagePin,
    deleteMessages,
    editMessageAndResend,
    appendExternalMessage,
    isInitializing,
    pendingApproval
  };
};

export { useMastra };
export { saveUserIdToSession, hasUserIdInSession } from './useSessionUser';
