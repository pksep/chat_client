import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import '../../src/assets/chat-container.css';
import MobileList from '../../src/components/ContactList/MobileList.vue';
import { authedUser } from '../../src/composables/useAuth';
import { useChatMenu } from '../../src/composables/useChatMenu';
import { refreshChatAccess } from '../../src/composables/useChatAccess';
import { emojiDirective } from '../../src/directives/emoji';

document.documentElement.classList.add('theme-light');
authedUser.value = {
  id: 'ios-pwa-test-user',
  initials: 'Проверка iPhone'
} as any;
await refreshChatAccess();
useChatMenu().setActiveSection('profile', { animate: false });
createApp({
  render: () =>
    h(
      'main',
      {
        class: 'chat-container',
        style: {
          gridTemplateRows: 'minmax(0, 1fr)',
          gridTemplateColumns: 'minmax(0, 1fr)'
        }
      },
      [h(MobileList)]
    )
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
