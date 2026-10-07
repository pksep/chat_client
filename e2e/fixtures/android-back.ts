import { createApp, defineAsyncComponent, h, ref } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import Modal from '../../src/components/UI/Modal.vue';
import MobileModal from '../../src/components/UI/MobileModal.vue';
import ModalCroppedAvatar from '../../src/components/UI/ModalCroppedAvatar.vue';
import ContextMenu from '../../src/components/ContactList/ContextMenu.vue';
import Header from '../../src/components/Header/Header.vue';
import MessageListUserItems from '../../src/components/Messages/MessageListUserItems.vue';
import { setTopics } from '../../src/composables/useTopics';
import { emojiDirective } from '../../src/directives/emoji';
import type {
  IMessage,
  ITopic
} from '../../src/components/interfaces/interfaces';
import { CALL_TOPIC_DESCRIPTION_PREFIX } from '../../src/utils/call-topic';
import { useBackButton } from '../../src/composables/useBackButton';
import { useMessageSwipe } from '../../src/components/Messages/composables/useMessageSwipe';
import {
  initRoute,
  navigateToCall,
  RouteTypes
} from '../../src/composables/navigation/useUrlRouting';
import { useUrlWatcher } from '../../src/composables/navigation/useUrlWatcher';
import {
  open as callOpen,
  isModalVisible,
  roomId,
  user
} from '../../src/services/useCallState';

const CallModal = defineAsyncComponent(
  () => import('../../src/components/CallModal/CallModal.vue')
);
const image = new File(
  [
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>'
  ],
  'avatar.svg',
  { type: 'image/svg+xml' }
);
const showHeaders = new URLSearchParams(location.search).has('headers');
history.replaceState({}, '', '/dialogs/android-back-topic');
initRoute();

const callTopic = {
  id: 'android-back-call-topic',
  type: 'GROUP',
  name: 'Временное имя группы',
  group: { id: 'android-back-call-topic', name: 'Временное имя группы' },
  info: { unreadCount: 0 }
} as ITopic;
const callMessages = [
  {
    id: 'call-style-message',
    topicId: callTopic.id,
    text: 'Материалы звонка',
    senderUserId: 'call-style-peer',
    senderUser: { id: 'call-style-peer', initials: 'Звонилка' },
    createdAt: '2026-10-05T10:00:00Z',
    media: []
  }
] as IMessage[];

createApp({
  setup() {
    const route = useUrlWatcher();
    useMessageSwipe(route);
    const baseOpen = ref(false);
    const nestedOpen = ref(false);
    const contextOpen = ref(false);
    const cropOpen = ref(false);
    const showCall = ref(false);
    const routeBacks = ref(0);
    const { addHandler, removeHandler } = useBackButton();
    const lateNavigation = () => {
      routeBacks.value++;
    };
    const closeBase = () => {
      baseOpen.value = false;
      removeHandler(lateNavigation);
    };
    const button = (id: string, action: () => void) =>
      h('button', { 'data-testid': id, onClick: action }, id);
    return () =>
      h('main', [
        showHeaders
          ? h(
              'section',
              { 'data-testid': 'Fixture-Headers' },
              ['dialogs', 'group', 'favorites', 'ai', 'call'].map(type =>
                h(Header, {
                  dataTestid: `Fixture-${type}`,
                  displayRoute: { type, id: null }
                })
              )
            )
          : null,
        button('Fixture-OpenModal', () => {
          baseOpen.value = true;
        }),
        button('Fixture-OpenCallTopic', () => {
          setTopics([callTopic]);
          navigateToCall(callTopic.id);
        }),
        button('Fixture-ClearCallMetadata', () => setTopics([])),
        button('Fixture-LoadCallMetadata', () =>
          setTopics([
            {
              ...callTopic,
              group: {
                ...callTopic.group,
                description: `${CALL_TOPIC_DESCRIPTION_PREFIX}test-room:test-user`
              }
            } as ITopic
          ])
        ),
        route.value.type === RouteTypes.CALL && route.value.id
          ? h(
              'section',
              { class: 'chat', 'data-testid': 'Fixture-CallTopic' },
              [
                h(Header, { dataTestid: 'Fixture-CallHeader' }),
                h(MessageListUserItems, {
                  dataTestid: 'Fixture-CallMessages',
                  messages: callMessages,
                  authUserId: 'test-user'
                })
              ]
            )
          : null,
        button('Fixture-OpenCall', () => {
          roomId.value = 'android-back-room';
          user.value = { id: 'android-back-peer', initials: 'Тест' } as any;
          callOpen.value = true;
          isModalVisible.value = true;
          showCall.value = true;
        }),
        h('output', { 'data-testid': 'Fixture-RouteBacks' }, routeBacks.value),
        h(
          'output',
          { 'data-testid': 'Fixture-CallOpen' },
          String(callOpen.value)
        ),
        h(
          Modal,
          {
            open: baseOpen.value,
            'data-testid': 'Fixture-BaseModal',
            onClose: closeBase
          },
          () => [
            button('Fixture-OpenNested', () => {
              nestedOpen.value = true;
            }),
            button('Fixture-LateNavigation', () => addHandler(lateNavigation)),
            button('Fixture-OpenContext', () => {
              contextOpen.value = true;
            }),
            button('Fixture-OpenCrop', () => {
              cropOpen.value = true;
            }),
            h(
              ContextMenu,
              {
                visible: contextOpen.value,
                position: { x: 80, y: 100 },
                dataTestid: 'Fixture-Context',
                onUnmountClose: () => {
                  contextOpen.value = false;
                }
              },
              () =>
                button('Fixture-NestedFromContext', () => {
                  nestedOpen.value = true;
                })
            )
          ]
        ),
        h(
          matchMedia('(max-width: 768px)').matches ? MobileModal : Modal,
          {
            open: nestedOpen.value,
            title: 'Вложенное окно',
            dataTestid: 'Fixture-Nested',
            onClose: () => {
              nestedOpen.value = false;
            },
            onUnmountClose: () => {
              nestedOpen.value = false;
            }
          },
          () => 'Содержимое'
        ),
        h(ModalCroppedAvatar, {
          open: cropOpen.value,
          image,
          'data-testid': 'Fixture-Crop',
          onUnmountClose: () => {
            cropOpen.value = false;
          }
        }),
        showCall.value ? h(CallModal) : null
      ]);
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
