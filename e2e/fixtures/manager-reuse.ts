import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { MediaType } from '@pksep/zod-shared-chat';
import '@pksep/yui/styles';
import { ContentEditor } from '@pksep/yui';
import '../../src/assets/message-bubble.css';
import MessageBubbleText from '../../src/components/Messages/MessageBubbleText.vue';
import MessageBubbleFiles from '../../src/components/Messages/MessageBubbleFiles.vue';
import MessageBubbleMedia from '../../src/components/Messages/MessageBubbleMedia.vue';
import type { IMedia } from '../../src/components/interfaces/interfaces';

const pixel =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="240" height="180"%3E%3Crect width="240" height="180" fill="%2377a6ff"/%3E%3C/svg%3E';
const file = {
  id: 'file-1',
  type: MediaType.File,
  path: '/fixture.txt',
  originName: 'Требования.txt',
  size: 1024
} as IMedia;
const media = {
  id: 'media-1',
  type: MediaType.Image,
  path: '',
  localPath: pixel,
  localThumbnailPath: pixel,
  originName: 'Схема.svg',
  size: 200,
  ex: { width: 240, height: 180 }
} as IMedia;
createApp({
  setup() {
    const opened = ref(0);
    const sent = ref(0);
    return () =>
      h(
        'main',
        {
          style:
            'max-width:420px;padding:24px;background:#f4f6fa;--surface-overlay:#fff'
        },
        [
          h('div', { class: 'message', 'data-is-me-sender': 'false' }, [
            h(MessageBubbleText, {
              message: '<p>Текст <strong>сообщения</strong></p>',
              isDialog: true,
              time: '10:00',
              dataTestid: 'ManagerText'
            })
          ]),
          h('div', { class: 'message', 'data-is-me-sender': 'true' }, [
            h(MessageBubbleFiles, {
              message: '<p>Документ</p>',
              isMeSender: true,
              media: [file],
              time: '10:01',
              dataTestid: 'ManagerFile',
              'onSet-slider': () => opened.value++
            })
          ]),
          h('div', { class: 'message', 'data-is-me-sender': 'false' }, [
            h(MessageBubbleMedia, {
              message: '',
              isDialog: true,
              media: [media],
              time: '10:02',
              dataTestid: 'ManagerMedia'
            })
          ]),
          h(
            'output',
            { 'data-testid': 'file-open-count' },
            String(opened.value)
          ),
          h('section', { 'data-testid': 'default-editor' }, [
            h(ContentEditor, {
              activeAttachFile: true,
              activeSend: true,
              'onUnmount-send': () => sent.value++
            })
          ]),
          h('output', { 'data-testid': 'send-count' }, String(sent.value))
        ]
      );
  }
})
  .use(createPinia())
  .mount('#app');
