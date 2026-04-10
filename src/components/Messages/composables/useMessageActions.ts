import { type Ref } from 'vue';
import type { IMessage, ITopic } from '../../interfaces/interfaces';
import {
  clearPendingForwardMessages,
  openForwardDraft
} from '../../../composables/useForwardMessages';

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

  const handleSetReplyMessage = (messageId?: string) => {
    clearSellectedMessage();
    state.replyMessage = messageId
      ? state.messages.find(m => m.id === messageId) || null
      : null;
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
