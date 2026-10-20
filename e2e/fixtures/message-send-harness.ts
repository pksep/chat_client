import { effectScope, ref } from 'vue';
import { authedUser } from '../../src/composables/useAuth';
import { useMessageSender } from '../../src/components/Messages/composables/useMessageSender';

export const mountMessageSender = (topicId: string) => {
  const scope = effectScope();
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
      authedUser,
      ref(null),
      () => {},
      () => {}
    )
  )!;
  return { ...sender, stop: () => scope.stop() };
};
