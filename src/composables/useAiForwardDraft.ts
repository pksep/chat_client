import { ref } from 'vue';
import type { IMessage, IMedia } from '../components/interfaces/interfaces';
import type { AiAssistantMessage, AiAssistantSession } from './useAiAssistant';
import { useAiAssistant } from './useAiAssistant';
import { useChatMenu } from './useChatMenu';
import { navigateToAI } from './navigation';
import { stripHtml } from '../utils/stripHtml';

type ForwardSourceMessage = IMessage | AiAssistantMessage;

export interface AiForwardDraft {
  sessionId: string;
  title: string;
  preview: string;
  context: string;
  messageCount: number;
}

const pendingAiForwardDraft = ref<AiForwardDraft | null>(null);

const isAiMessage = (
  message: ForwardSourceMessage
): message is AiAssistantMessage => 'role' in message;

const getMediaLabel = (media?: IMedia[]): string =>
  (media || [])
    .map(file => file.originName)
    .filter(Boolean)
    .join(', ');

const getMessageAuthor = (message: ForwardSourceMessage): string => {
  if (isAiMessage(message)) {
    return message.role === 'assistant' ? 'СЭПи' : 'Пользователь';
  }

  return message.senderUser?.initials || 'Пользователь';
};

const getMessageText = (message: ForwardSourceMessage): string => {
  const text = stripHtml(message.text || '').trim();
  if (text) return text;

  if (!isAiMessage(message)) {
    const mediaLabel = getMediaLabel(message.media);
    if (mediaLabel) return `Вложения: ${mediaLabel}`;
  }

  return 'Сообщение без текста';
};

const createAiForwardDraft = (
  sessionId: string,
  messages: ForwardSourceMessage[]
): AiForwardDraft | null => {
  const normalizedMessages = messages.filter(Boolean);
  if (!sessionId || normalizedMessages.length === 0) return null;

  const firstMessage = normalizedMessages[0];
  const firstAuthor = getMessageAuthor(firstMessage);
  const preview = getMessageText(firstMessage);
  const title =
    normalizedMessages.length === 1
      ? `Переслано от ${firstAuthor}`
      : `Переслано сообщений: ${normalizedMessages.length}`;

  return {
    sessionId,
    title,
    preview,
    messageCount: normalizedMessages.length,
    context: [
      title,
      ...normalizedMessages.map(
        message => `${getMessageAuthor(message)}:\n${getMessageText(message)}`
      )
    ].join('\n\n')
  };
};

export const restoreAiForwardDraft = (draft: AiForwardDraft): void => {
  pendingAiForwardDraft.value = { ...draft };
};

export const clearAiForwardDraft = (sessionId?: string): void => {
  if (sessionId && pendingAiForwardDraft.value?.sessionId !== sessionId) {
    return;
  }

  pendingAiForwardDraft.value = null;
};

export const openAiForwardDraft = (
  session: AiAssistantSession,
  messages: ForwardSourceMessage[] | ForwardSourceMessage
): void => {
  const draft = createAiForwardDraft(
    session.id,
    Array.isArray(messages) ? messages : [messages]
  );
  if (!draft) return;

  pendingAiForwardDraft.value = draft;
  useAiAssistant().selectSession(session.id);
  useChatMenu().setActiveSection('ai');
  navigateToAI(session.id);
};

export const useAiForwardDraft = () => ({
  pendingAiForwardDraft,
  clearAiForwardDraft,
  restoreAiForwardDraft,
  openAiForwardDraft
});
