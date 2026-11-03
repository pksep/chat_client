import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import MenuProfilePanel from '../../src/components/Menu/MenuProfilePanel.vue';
import {
  saveChatAuthSession,
  setAuthUser
} from '../../src/composables/useAuth';
import { setAuthToken } from '../../src/composables/useLogin';
import { setConfig } from '../../src/services/useConfig';
import type { IUser } from '../../src/components/interfaces/interfaces';
import type { ChatAuthSessionSource } from '../../src/utils/stored-chat-session';
import '../../src/assets/chat-container.css';

const theme = new URLSearchParams(location.search).get('theme') || 'light';
document.documentElement.dataset.theme = theme;
setConfig({
  CHAT_API_DOMAIN: `${location.origin}/api`,
  CHAT_ERP_URL: `${location.origin}/erp`
});
localStorage.setItem(
  'chat_runtime_last_organization',
  'https://corporate.pksep.test'
);
const user = { id: 'profile-qr-user', initials: 'Пупкин И.И.' } as IUser;
const setToken = (
  token: string,
  source: ChatAuthSessionSource = 'chat_credentials'
) => {
  setAuthToken(token);
  saveChatAuthSession({ token, user, source });
};
setToken('profile-qr-test-token');
setAuthUser(user);
const isCollapse = ref(false);
const isActive = ref(true);

Object.assign(window, {
  profileQrFixture: {
    setToken,
    collapse: () => (isCollapse.value = true),
    leave: () => (isActive.value = false)
  }
});

createApp({
  render: () =>
    h(
      'main',
      {
        class: matchMedia('(max-width: 768px)').matches
          ? 'mobile-list-container'
          : 'menu',
        style: 'width:320px;max-width:100%;height:100dvh'
      },
      [
        h(MenuProfilePanel, {
          dataTestid: 'Fixture',
          isCollapse: isCollapse.value,
          isActive: isActive.value
        })
      ]
    )
})
  .use(createPinia())
  .mount('#app');
