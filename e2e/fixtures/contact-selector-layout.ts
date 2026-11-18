import { createApp, defineAsyncComponent, h, reactive, ref } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import ContactSelector from '../../src/components/NewChat/ContactSelector.vue';
import NewGroupModal from '../../src/components/NewChat/NewGroupModal.vue';
import NewContactModal from '../../src/components/NewChat/NewContactModal.vue';
import NewBotModal from '../../src/components/NewChat/NewBotModal.vue';
import NewChatMobileModal from '../../src/components/NewChat/NewChatMobileModal.vue';
import TopicSelector from '../../src/components/TopicSelector.vue';
import MobileModal from '../../src/components/UI/MobileModal.vue';
import ChatsToolbar from '../../src/components/Menu/ChatsToolbar.vue';
import { authedUser } from '../../src/composables/useAuth';
import { upsertLocalUser } from '../../src/composables/useUsers';
import { emojiDirective } from '../../src/directives/emoji';
import type { IUser } from '../../src/components/interfaces/interfaces';
import { initializeChat, waitForChatSDK } from '../../src/services/useChat';

// Настоящие компоненты, тестовые контакты без запросов к локальной БД.
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'selector';
const count = params.has('long') ? 40 : 2;
const mobile = matchMedia('(max-width: 768px)').matches;
document.documentElement.dataset.theme = params.get('theme') || 'light';
authedUser.value = {
  id: 'selector-layout-auth',
  initials: 'Фамилия И. О.',
  nickname: 'author',
  lastOnline: '2026-10-02T00:00:00.000Z'
} as IUser;
for (let index = 0; index < count; index++) {
  upsertLocalUser({
    id: `selector-layout-user-${index}`,
    initials: `Участник ${index + 1}`,
    name: 'Участник',
    surname: String(index + 1),
    nickname: `participant${index + 1}`,
    lastOnline: '2026-10-02T00:00:00.000Z'
  } as IUser);
}

if (params.has('bots')) {
  for (const nickname of ['project_bot', 'zvonilka']) {
    upsertLocalUser({
      id: `selector-layout-${nickname}`,
      initials: nickname === 'zvonilka' ? 'Звонилка' : 'Бот проекта',
      nickname,
      isBot: true,
      lastOnline: '2026-10-02T00:00:00.000Z'
    } as IUser);
  }
}

const groupRequests = ref<unknown[]>([]);
if (params.has('mock-group')) {
  // Изолированный SDK: сеть и фоновая синхронизация не запускаются.
  void initializeChat({
    token: 'group-layout-fixture',
    apiUrl: `${location.origin}/fixture-api`,
    wsUrl: location.origin,
    cacheReady: new Promise<void>(() => {})
  });
  const sdk = await waitForChatSDK();
  let failNext = params.has('fail-once');
  sdk.createGroup = async data => {
    groupRequests.value.push(data);
    await new Promise(resolve => setTimeout(resolve, 350));
    if (failNext) {
      failNext = false;
      throw new Error('Тестовая ошибка создания группы');
    }
    return { id: 'fixture-group', topicId: 'fixture-topic' } as never;
  };
  sdk.uploadFile = async file => {
    const objectName = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });
    return { objectName, thumbnailObjectName: null } as never;
  };
}

createApp({
  setup() {
    const groupOpen = ref(true);
    const creationModal = ref<'group' | 'bot' | null>(null);
    const mountedCreationModals = reactive(new Set<'group' | 'bot'>());
    const NewBotMobileModal = defineAsyncComponent(
      () => import('../../src/components/NewChat/NewBotMobileModal.vue')
    );
    const openCreationModal = (kind: 'group' | 'bot') => {
      mountedCreationModals.add(kind);
      creationModal.value = kind;
    };
    return () => {
      if (mode === 'creation') {
        return h('main', [
          h(ChatsToolbar, {
            onCreateGroup: () => openCreationModal('group'),
            onCreateBot: () => openCreationModal('bot')
          }),
          ...(['group', 'bot'] as const).map(kind =>
            mountedCreationModals.has(kind)
              ? h(kind === 'group' ? NewChatMobileModal : NewBotMobileModal, {
                  open: creationModal.value === kind,
                  onUnmountClose: () => (creationModal.value = null)
                })
              : null
          )
        ]);
      }
      if (mode === 'group') {
        return h('main', [
          h(
            'button',
            { onClick: () => (groupOpen.value = true) },
            'Создать группу'
          ),
          h(
            'button',
            {
              onClick: () => {
                document.documentElement.dataset.theme =
                  document.documentElement.dataset.theme === 'dark'
                    ? 'light'
                    : 'dark';
              }
            },
            'Сменить тему'
          ),
          h(
            'output',
            { 'data-testid': 'GroupRequests' },
            JSON.stringify(groupRequests.value)
          ),
          h(mobile ? NewChatMobileModal : NewGroupModal, {
            open: groupOpen.value,
            onUnmountClose: () => (groupOpen.value = false)
          })
        ]);
      }
      if (mode === 'contact') {
        return h(NewContactModal, {
          open: groupOpen.value,
          onUnmountClose: () => (groupOpen.value = false)
        });
      }
      if (mode === 'bot') {
        return h(NewBotModal, {
          open: groupOpen.value,
          onUnmountClose: () => (groupOpen.value = false)
        });
      }
      if (mode === 'bot-mobile' || mode === 'contact-mobile') {
        return h(
          mode === 'bot-mobile' ? NewBotMobileModal : NewChatMobileModal,
          {
            open: groupOpen.value,
            isAddOne: true,
            onUnmountClose: () => (groupOpen.value = false)
          }
        );
      }
      if (mode === 'forward') {
        return h(
          MobileModal,
          { open: true, class: 'message-forward-modal', title: 'Переслать' },
          { default: () => h(TopicSelector) }
        );
      }
      if (mode === 'dividers') {
        return h(
          'ul',
          {
            class: [
              'contact-list',
              { 'chat-folder-editor__topics': params.has('folders') }
            ],
            style: 'width:min(345px,100%)'
          },
          [0, 1, 2].map(index =>
            h('li', { class: 'contact-list__li' }, [
              h(
                'div',
                {
                  class: [
                    'contact-list__item',
                    {
                      'contact-list__item--active':
                        index === 1 && params.has('active')
                    }
                  ]
                },
                `Чат ${index + 1}`
              )
            ])
          )
        );
      }
      return h(ContactSelector, {
        style:
          'height:404px;width:min(350px,100%);background:var(--surface-overlay)'
      });
    };
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
