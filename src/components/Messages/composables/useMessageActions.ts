import { type Ref } from 'vue';
import type { IMessage, ITopic } from '../../interfaces/interfaces';
import { TopicType } from '../../../services/useChatSDK/types';
import {
  navigateToDialogs,
  navigateToGroup
} from '../../../composables/navigation/useUrlRouting';

export function useMessageActions(
  state: {
    editMessage: IMessage | null;
    replyMessage: IMessage | null;
    forwardMessage: IMessage | null;
    messages: IMessage[];
  },
  inputText: Ref<string>,
  messageListInputRef: Ref<any>
) {
  const clearSellectedMessage = () => {
    messageListInputRef.value?.focus();
    state.replyMessage = null;
    state.editMessage = null;
    state.forwardMessage = null;
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
      state.forwardMessage = null;
      return;
    }
    if (props.topic.type === TopicType.DM) {
      navigateToDialogs(props.topic.id);
    } else {
      navigateToGroup(props.topic.id);
    }
    setTimeout(() => {
      state.forwardMessage = props.message;
    }, 0);

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
