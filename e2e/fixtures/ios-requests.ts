import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import '../../src/assets/chat-container.css';
import { initIosPwaViewport } from '../../src/utils/ios-pwa-viewport';
import AuthorizationScreen from '../../src/components/AuthorizationScreen.vue';
import CallParticipantsPanel from '../../src/components/CallModal/CallParticipantsPanel.vue';
import CallModal from '../../src/components/CallModal/CallModal.vue';
import ProfileAttachmentsPanel from '../../src/components/ProfileAttachmentsPanel.vue';
import { setConfig } from '../../src/services/useConfig';
import { ChatSDK } from '../../src/services/useChatSDK';
import { initializeChat } from '../../src/services/useChat';

initIosPwaViewport();
document.documentElement.classList.add('theme-light');
const kind = new URLSearchParams(location.search).get('kind');
setConfig({
  CHAT_API_DOMAIN: '/e2e/ios-api',
  CHAT_PATH_TO_FILE_CDN: '/e2e/ios-api/media/object'
} as any);
if (kind === 'attachments') {
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  ChatSDK.prototype.getTopicMedia = async () =>
    ({
      items: ['image.png', 'IMG_8538.jpeg'].map((name, i) => ({
        media: {
          id: name,
          originName: name,
          path: name,
          thumbnailPath: `missing-${name}`,
          type: 'IMAGE',
          localPath: 'blob:expired-preview'
        },
        message: {
          id: `attachment-${i}`,
          topicId: 'attachments-fixture',
          createdAt: new Date().toISOString()
        }
      })),
      nextCursor: null,
      hasMore: false
    }) as any;
  await initializeChat({
    userId: 'fixture-user',
    token: 'fixture-token',
    apiUrl: `${location.origin}/e2e/ios-api`,
    wsUrl: 'ws://127.0.0.1:65530'
  });
}
const credentials = ref(false);
const page = ref(0);
const selected = ref('');
const url = ref('');
const password = ref('');
const identifier = ref('');
const participants = Array.from({ length: 8 }, (_, i) => ({
  identity: `peer-${i}`,
  tileId: `peer-${i}`,
  name: `Участник ${i + 1}`,
  initials: `У${i + 1}`,
  avatarUrl: '',
  isVideoActive: false,
  isLocal: false,
  isHandRaised: false,
  activeReactionEmoji: '',
  activeReactionVideoSrc: '',
  activeReactionVideoKey: '',
  isSpeaking: false,
  audioLevel: 0,
  isMicActive: false,
  connectionQuality: 'excellent',
  hasAudio: false
}));
createApp({
  render: () =>
    kind === 'auth'
      ? h(AuthorizationScreen, {
          url: url.value,
          identifier: identifier.value,
          password: password.value,
          organizations: [],
          rememberAccount: true,
          isCredentialsStep: credentials.value,
          'onUpdate:url': (value: string) => (url.value = value),
          'onUpdate:password': (value: string) => (password.value = value),
          'onUpdate:identifier': (value: string) => (identifier.value = value),
          onSubmit: () => (credentials.value = true)
        })
      : kind === 'attachments'
        ? h(ProfileAttachmentsPanel, { topicId: 'attachments-fixture' })
        : kind === 'call'
          ? h(CallModal)
          : h('div', { class: 'call-modal' }, [
              h(
                'div',
                {
                  class: 'call-modal__container',
                  style: 'height:100%;box-sizing:border-box'
                },
                [
                  h(
                    'output',
                    { 'data-testid': 'page' },
                    `${page.value}:${selected.value}`
                  ),
                  h(CallParticipantsPanel, {
                    participants: participants.slice(
                      page.value * 4,
                      page.value * 4 + 4
                    ),
                    focusedParticipant: null,
                    currentPage: page.value,
                    totalPages: 2,
                    currentPageParticipantCount: 4,
                    goToPage: (value: number) => (page.value = value),
                    setRemoteVideoRef: () => {},
                    onSelectParticipant: (id: string | null) =>
                      (selected.value = id || '')
                  })
                ]
              )
            ])
})
  .use(createPinia())
  .mount('#app');
(window as any).iosRequestsReady = true;
