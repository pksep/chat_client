import { createApp, h, type VNode } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import '../../src/assets/add-user.css';
import '../../src/assets/menu-info.css';
import Header from '../../src/components/Header/Header.vue';
import AiConversationInfoPanel from '../../src/components/AI/AiConversationInfoPanel.vue';
import MessageReferenceBlock from '../../src/components/Messages/MessageReferenceBlock.vue';
import Modal from '../../src/components/UI/Modal.vue';
import MobileModal from '../../src/components/UI/MobileModal.vue';
import NewChatInformationForm from '../../src/components/NewChat/NewChatInformationForm.vue';
import { setConfig } from '../../src/services/useConfig';
import { setAuthToken } from '../../src/composables/useLogin';
import { setAuthUser } from '../../src/composables/useAuth';
import { refreshChatAccess } from '../../src/composables/useChatAccess';
import { useAiAssistant } from '../../src/composables/useAiAssistant';
import { useAiConversationInfo } from '../../src/composables/useAiConversationInfo';
import type { IUser } from '../../src/components/interfaces/interfaces';

const threadId = '13bb30de-aeab-4055-ad84-5db2272168b6';
const ownerId = 'local-ui-test-user';
const user = { id: ownerId, name: 'Тест', initials: 'Тест' } as IUser;
localStorage.setItem(
  'chat_auth_session',
  JSON.stringify({ token: 'fixture', user })
);
setConfig({
  CHAT_API_DOMAIN: `${location.origin}/mock-api`,
  CHAT_MASTRA_URL: `${location.origin}/mock-ai`
});
setAuthToken('fixture');
setAuthUser(user);
await refreshChatAccess();
const assistant = useAiAssistant();
const options = new URLSearchParams(location.search);
const empty = options.has('empty');
if (!empty) {
  assistant.applyConversationInfo({
    threadId,
    ownerId,
    organizationId: 'company',
    title: 'Мои задачи',
    muted: false,
    generation: 0,
    deleted: false
  });
  assistant.selectSession(threadId);
}
const panel = useAiConversationInfo();
const mobile = innerWidth <= 768;
const foreign = options.has('foreign');

createApp({
  setup(): () => VNode {
    return (): VNode =>
      h(
        'main',
        { class: 'chat-container theme-light', style: 'min-height:100vh' },
        [
          h(Header, {
            displayRoute: { type: 'ai', id: empty ? null : threadId }
          }),
          options.has('group')
            ? h(NewChatInformationForm, { name: 'Тестовая группа' })
            : null,
          h(MessageReferenceBlock, {
            messageEx: JSON.stringify({
              aiSource: {
                threadId,
                ownerId: foreign ? 'other-user' : ownerId,
                organizationId: 'company',
                title: 'Мои задачи'
              }
            })
          }),
          panel.isOpen.value
            ? h(
                mobile ? MobileModal : Modal,
                {
                  open: true,
                  position: 'right',
                  width: '404px',
                  title: 'Информация о чате',
                  onClose: panel.close,
                  'onUnmount-close': panel.close
                },
                { default: (): VNode => h(AiConversationInfoPanel, { mobile }) }
              )
            : null
        ]
      );
  }
})
  .use(createPinia())
  .mount('#app');
