import { createApp, h, ref, type VNode } from 'vue';
import { createPinia } from 'pinia';
import { MediaType } from '@pksep/zod-shared-chat';
import '@pksep/yui/styles';
import '../../src/assets/message-bubble.css';
import MessageBubble from '../../src/components/Messages/MessageBubble.vue';
import type { IMedia } from '../../src/components/interfaces/interfaces';
import { setConfig } from '../../src/services/useConfig';
import { setAuthToken, useLogout } from '../../src/composables/useLogin';
import { ensureMediaObjectUrl } from '../../src/services/useMediaBlobCache';

const path = 'manager-private/66aef580-b856-48b3-8636-68ac07cb2cbd';

setConfig({
  CHAT_API_DOMAIN: `${location.origin}/api`,
  CHAT_PATH_TO_FILE_CDN: `${location.origin}/api/media/object/`
});
setAuthToken('fixture-manager');

const newMedia = (): IMedia => ({
  id: 'external-photo',
  path,
  thumbnailPath: path,
  originName: 'Фото.webp',
  type: MediaType.Image,
  size: 42,
  ex: {}
});

createApp({
  setup(): () => VNode {
    const medias = ref([newMedia()]);
    const warmCount = ref(0);

    return () =>
      h('main', { style: 'padding:24px;max-width:420px' }, [
        h(
          'button',
          {
            onClick: (): void => {
              medias.value = [newMedia()];
            }
          },
          'Обновить историю'
        ),
        h(
          'button',
          {
            onClick: async (): Promise<void> => {
              await Promise.all(
                Array.from({ length: 5 }, () => ensureMediaObjectUrl(path))
              );
              warmCount.value++;
            }
          },
          'Прогреть'
        ),
        h('button', { onClick: useLogout }, 'Выйти'),
        h(
          'button',
          {
            onClick: (): void => {
              setAuthToken('fixture-other-manager');
            }
          },
          'Другой пользователь'
        ),
        h('output', { 'data-testid': 'warm-count' }, String(warmCount.value)),
        h(MessageBubble, {
          message: '',
          messageId: 'external-message',
          topicId: 'external-topic',
          isDialog: true,
          media: medias.value,
          messageEx: { managerSource: { channel: 'max' } },
          dataTestid: 'ManagerIncomingPhoto'
        })
      ]);
  }
})
  .use(createPinia())
  .mount('#app');
