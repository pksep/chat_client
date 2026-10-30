import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import '../../src/assets/menu.css';
import '../../src/assets/contact-list.css';
import '../../src/assets/mobile-list.css';
import '../../src/assets/menu-layout.css';
import '../../src/assets/chat-folders.css';
import ChatsToolbar from '../../src/components/Menu/ChatsToolbar.vue';
import ChatFolderRail from '../../src/components/Menu/ChatFolderRail.vue';
import ChatFoldersPanel from '../../src/components/Menu/ChatFoldersPanel.vue';
import ClientsPanel from '../../src/components/Clients/ClientsPanel.vue';
import TopicList from '../../src/components/ContactList/TopicList.vue';
import { authedUser, saveChatAuthSession } from '../../src/composables/useAuth';
import { refreshChatAccess } from '../../src/composables/useChatAccess';
import { refreshManagerInquiries } from '../../src/composables/useManagerInquiries';
import { useChatFolders } from '../../src/composables/useChatFolders';
import { setTopics } from '../../src/composables/useTopics';
import { setConfig } from '../../src/services/useConfig';
import { getChatSDK, initializeChat } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import { installFolderFixtureSocket } from './folder-fixture-socket';
import { emojiDirective } from '../../src/directives/emoji';
import type { ITopic, IUser } from '../../src/components/interfaces/interfaces';

// Настоящие компоненты, фильтры и сохранение порядка через изолированный транспорт.
const params = new URLSearchParams(location.search);
const clients = params.has('clients');
const mobile = matchMedia('(max-width: 768px)').matches;
if (params.has('dark')) {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.classList.add('theme-dark');
}
const user = { id: 'folder-menu-user', initials: 'Тест' } as IUser;
authedUser.value = user;
saveChatAuthSession({ token: 'folder-menu-fixture', user }, false);
setConfig({ CHAT_API_DOMAIN: `${location.origin}/folder-menu-api` });
ChatSDK.prototype.connect = () => new Promise<void>(() => {});
await initializeChat({
  userId: user.id,
  token: 'folder-menu-fixture',
  apiUrl: `${location.origin}/folder-menu-api`,
  wsUrl: 'ws://127.0.0.1:65530'
});
installFolderFixtureSocket(getChatSDK()!);
const topics = ['Сайт', 'Авито', 'ВК', 'Поддержка'].map((name, index) => ({
  id: `topic-${index}`,
  type: 'GROUP',
  name: `Клиент ${name}`,
  group: { id: `topic-${index}`, name: `Клиент ${name}` },
  info: { isPin: false, isMute: false },
  unreadMessageCount: 0
})) as ITopic[];
setTopics(topics);
const state = useChatFolders(clients ? 'clients' : 'chats');
if (params.has('background')) void state.loadFolders();
else await state.loadFolders();
if (clients) {
  await refreshChatAccess();
  await refreshManagerInquiries();
}

createApp({
  setup() {
    const search = ref('');
    return () =>
      h(
        'main',
        {
          class: mobile ? 'mobile-list-container' : 'menu menu--folders',
          style: mobile ? 'height:100dvh' : 'height:700px;width:435px'
        },
        [
          h(
            'section',
            {
              class: mobile ? 'mobile-list-container__section' : 'menu__start'
            },
            clients
              ? [h(ClientsPanel, { isMobile: mobile })]
              : [
                  ...(!mobile
                    ? [
                        h(ChatFolderRail, {
                          folders: state.folders.value,
                          topics,
                          selectedFolderId: state.activeFolderId.value,
                          isManaging: state.isManagingFolders.value,
                          isActive: true,
                          onSelect: state.selectFolder,
                          onManage: state.openFolderManager
                        })
                      ]
                    : []),
                  state.isManagingFolders.value
                    ? h(ChatFoldersPanel, {
                        mobile,
                        folders: state.folders.value,
                        topics,
                        selectedFolderId: state.activeFolderId.value,
                        onClose: state.closeFolderManager,
                        onSelectFolder: state.selectFolder
                      })
                    : h(
                        ChatsToolbar,
                        {
                          modelValue: search.value,
                          'onUpdate:modelValue': (value: string) =>
                            (search.value = value),
                          class: mobile ? 'mobile-list-container__toolbar' : '',
                          filterCounts: {
                            all: 4,
                            chats: 0,
                            groups: 4,
                            bots: 0
                          },
                          dataTestid: 'MobileFolders'
                        },
                        mobile
                          ? {
                              folders: () =>
                                h(ChatFolderRail, {
                                  mobile,
                                  folders: state.folders.value,
                                  topics,
                                  selectedFolderId: state.activeFolderId.value,
                                  isManaging: false,
                                  isActive: true,
                                  onSelect: state.selectFolder,
                                  onManage: state.openFolderManager
                                })
                            }
                          : {}
                      ),
                  ...(!state.isManagingFolders.value
                    ? [
                        h(TopicList, {
                          topics: topics.filter(
                            topic =>
                              (!state.activeFolder.value ||
                                state.activeFolder.value.topicIds.includes(
                                  topic.id
                                )) &&
                              topic.name
                                .toLocaleLowerCase('ru')
                                .includes(search.value.toLocaleLowerCase('ru'))
                          ),
                          dataTestid: 'Fixture-Topics'
                        }),
                        h('div', { style: 'height:1000px' })
                      ]
                    : [])
                ]
          )
        ]
      );
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
