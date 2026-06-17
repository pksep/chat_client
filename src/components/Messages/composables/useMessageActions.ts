import { type Ref } from 'vue';
import type { IMessage, ITopic } from '../../interfaces/interfaces';
import {
  clearPendingForwardMessages,
  openForwardDraft
} from '../../../composables/useForwardMessages';

type ReplyMessagePayload =
  | string
  | {
      messageId?: string;
      quoteText?: string;
      quoteOccurrenceIndex?: number;
    }
  | null
  | undefined;

export function useMessageActions(
  state: {
    editMessage: IMessage | null;
    replyMessage: IMessage | null;
    forwardMessages: IMessage[];
    messages: IMessage[];
  },
  inputText: Ref<string>,
  messageListInputRef: Ref<any>
) {
  const clearSellectedMessage = () => {
    messageListInputRef.value?.focus();
    state.replyMessage = null;
    state.editMessage = null;
    state.forwardMessages = [];
    clearPendingForwardMessages();
  };

  const handleSetEditMessage = (messageId?: string) => {
    clearSellectedMessage();
    state.editMessage = messageId
      ? state.messages.find(m => m.id === messageId) || null
      : null;

    inputText.value = state.editMessage?.text || '';
  };

  const handleSetReplyMessage = (payload?: ReplyMessagePayload) => {
    clearSellectedMessage();

    const messageId =
      typeof payload === 'string' ? payload : payload?.messageId;
    const quoteText =
      typeof payload === 'string' ? undefined : payload?.quoteText;
    const quoteOccurrenceIndex =
      typeof payload === 'string' ? undefined : payload?.quoteOccurrenceIndex;
    const message = messageId
      ? state.messages.find(m => m.id === messageId) || null
      : null;

    state.replyMessage =
      message && quoteText
        ? {
            ...message,
            replyQuoteText: quoteText,
            replyQuoteOccurrenceIndex: quoteOccurrenceIndex
          }
        : message;
  };

  const handleSetForwardMessage = (
    props: {
      message: IMessage;
      topic: ITopic;
    } | null
  ) => {
    clearSellectedMessage();
    if (!props) {
      return;
    }
    openForwardDraft(props.topic, props.message);

    setTimeout(() => {
      messageListInputRef.value?.focus();
    }, 500);
  };

  return {
    clearSellectedMessage,
    handleSetEditMessage,
    handleSetReplyMessage,
    handleSetForwardMessage
  };
}
