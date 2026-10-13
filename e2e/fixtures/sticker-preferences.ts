import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/chat-container.css';

// Фикстура не читает и не изменяет сессию пользователя открытого чата.
for (const name of ['localStorage', 'sessionStorage']) {
  const storage = new Map<string, string>();
  Object.defineProperty(window, name, {
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear()
    }
  });
}
const [
  { default: MenuProfilePanel },
  { default: StickersHarness },
  { setAuthUser },
  { initializeChat }
] = await Promise.all([
  import('../../src/components/Menu/MenuProfilePanel.vue'),
  import('./StickersHarness.vue'),
  import('../../src/composables/useAuth'),
  import('../../src/services/useChat')
]);
const apiUrl = `${window.location.origin}/e2e/sticker-preferences-api`;
const user = await fetch(`${apiUrl}/users/current`).then(response =>
  response.json()
);
setAuthUser(user);
await initializeChat({
  token: 'isolated-sticker-preferences-test',
  apiUrl,
  wsUrl: 'ws://127.0.0.1:65530',
  userId: user.id
});
const app = createApp({
  render: () =>
    h('div', { class: 'sticker-preferences-fixture' }, [
      h(
        'aside',
        { class: 'sticker-preferences-fixture__profile' },
        h(MenuProfilePanel, { dataTestid: 'StickerPreferencesProfile' })
      ),
      h(StickersHarness)
    ])
});
app.use(createPinia());
app.mount('#app');
const style = document.createElement('style');
style.textContent = `
  .sticker-preferences-fixture { display: flex; align-items: flex-start; gap: 20px; }
  .sticker-preferences-fixture__profile { flex: 0 0 345px; padding: 10px; }
  .sticker-preferences-fixture > main { min-width: 0; flex: 1; }
  @media (max-width: 767px) {
    .sticker-preferences-fixture { display: block; }
    .sticker-preferences-fixture__profile { width: 100%; }
  }
`;
document.head.append(style);
