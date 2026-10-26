import { effectScope, ref } from 'vue';
import { authedUser } from '../../src/composables/useAuth';
import { useMessageSender } from '../../src/components/Messages/composables/useMessageSender';

export const mountMessageSender = (topicId: string) => {
  const scope = effectScope();
  const senderUser = ref(authedUser.value);
  const sender = scope.run(() =>
    useMessageSender(
      ref({ id: topicId, type: 'dialogs' }),
      ref('проверка отправки'),
      {
        aiMessages: [],
        editMessage: null,
        replyMessage: null,
        forwardMessages: [],
        hideUnreadMarker: false
      },
      senderUser,
      ref(null),
      () => {},
      () => {}
    )
  )!;
  return {
    ...sender,
    setAuthUser: (user: typeof authedUser.value) => {
      senderUser.value = user;
    },
    stop: () => scope.stop()
  };
};
