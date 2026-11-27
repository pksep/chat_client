import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import '../../src/assets/chat-container.css';
import MobileList from '../../src/components/ContactList/MobileList.vue';
import HeaderMenu from '../../src/components/Header/HeaderMenu.vue';
import { authedUser, saveChatAuthSession } from '../../src/composables/useAuth';
import { setAuthToken } from '../../src/composables/useLogin';
import { useChatMenu } from '../../src/composables/useChatMenu';
import { refreshChatAccess } from '../../src/composables/useChatAccess';
import { emojiDirective } from '../../src/directives/emoji';
import { setTopics } from '../../src/composables/useTopics';
import { setConfig } from '../../src/services/useConfig';
import type { ITopic } from '../../src/components/interfaces/interfaces';

const params = new URLSearchParams(location.search);
document.documentElement.classList.add('theme-light');
setConfig({
  CHAT_API_DOMAIN: '/e2e/ios-api',
  CHAT_PATH_TO_FILE_CDN: '/e2e/ios-api/media/object'
} as any);
authedUser.value = {
  id: 'ios-pwa-test-user',
  initials: 'Проверка iPhone',
  avatarUrl: '/e2e/ios-api/avatar.svg'
} as any;
if (params.get('access') === 'all') {
  setAuthToken('ios-pwa-fixture-token');
  saveChatAuthSession(
    { token: 'ios-pwa-fixture-token', user: authedUser.value },
    false
  );
}
setTopics(
  Array.from({ length: 60 }, (_, index) => ({
    id: `iphone-chat-${index}`,
    type: 'GROUP',
    name: `Чат iPhone ${index + 1}`,
    avatarUrl: '/e2e/ios-api/avatar.svg',
    group: {
      id: `iphone-chat-${index}`,
      name: `Чат iPhone ${index + 1}`
    },
    unreadMessageCount: index === 0 ? 2 : 0,
    info: {}
  })) as ITopic[]
);
await refreshChatAccess();
useChatMenu().setActiveSection(
  params.get('kind') === 'menu' ? 'chats' : 'profile',
  { animate: false }
);
createApp({
  render: () => [
    h('div', { class: 'chat_container_alert' }, 'beta'),
    h(
      'main',
      {
        class: 'chat-container',
        style: {
          gridTemplateColumns: 'minmax(0, 1fr)'
        }
      },
      [
        h(HeaderMenu, { class: 'chat__header-menu' }),
        h('section', { class: 'chat chat__messages chat--mobile-route' }, [
          h('div', { class: 'chat__mobile-list-layer' }, [h(MobileList)])
        ])
      ]
    )
  ]
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
