import { computed, createApp, h } from 'vue';
import MessageBubbleCall from '../../src/components/Messages/MessageBubbleCall.vue';
import MenuBottomNav from '../../src/components/Menu/MenuBottomNav.vue';
import { initializeCallHistoryFixture } from './call-history';
import { refreshChatAccess } from '../../src/composables/useChatAccess';

const fixture = await initializeCallHistoryFixture();
await refreshChatAccess();
localStorage.setItem(
  'sep:chat:missed-calls-seen-at:call-history-user',
  String(Date.now() - 60_000)
);
const currentCall = computed(
  () => fixture.useCallHistoryStore().rawCallHistory.value[0]
);
createApp({
  setup() {
    return () => [
      currentCall.value
        ? h(MessageBubbleCall, {
            message: '',
            messageEx: currentCall.value.ex,
            authUserId: fixture.authedUser.value?.id,
            isMeSender:
              currentCall.value.senderUserId === fixture.authedUser.value?.id,
            dataTestid: 'CallBubble',
            time: '19:48'
          })
        : null,
      h(MenuBottomNav, { dataTestid: 'CallNav' })
    ];
  }
}).mount('#messages');
(window as any).unansweredCallFixture = fixture;
