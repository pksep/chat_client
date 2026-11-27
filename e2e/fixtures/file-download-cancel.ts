import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageBubbleFiles from '../../src/components/Messages/MessageBubbleFiles.vue';
import {
  handleNativeFileClick,
  getNativeFileDownloadState
} from '../../src/services/useNativeFile';
import { setConfig } from '../../src/services/useConfig';
import type { IMedia } from '../../src/components/interfaces/interfaces';
import type { ProfileAttachmentSource } from '../../src/components/interfaces/profile-attachment-source';
import '../../src/assets/chat-container.css';

setConfig({ CHAT_PATH_TO_FILE_CDN: location.origin });
const media = ['Документ.docx', 'Второй.txt'].map(
  (originName, index) =>
    ({
      id: `cancel-file-${index}`,
      originName,
      path: `${location.origin}/api/media/object/cancel-file-${index}`,
      type: MediaType.File,
      size: 1024 * 1024
    }) as IMedia
);
const query = new URLSearchParams(location.search);
document.documentElement.classList.toggle(
  'theme-dark',
  query.get('theme') === 'dark'
);
document.body.style.padding = '48px';
const attachments = query.has('attachments')
  ? (await import('../../src/components/ProfileAttachmentsPanel.vue')).default
  : null;
const source: ProfileAttachmentSource = {
  key: 'download-progress-fixture',
  load: async () => ({
    items: media.map((file, index) => ({
      media: file,
      message: {
        id: `download-message-${index}`,
        topicId: 'download-fixture',
        createdAt: '2026-11-27T06:00:00.000Z'
      } as any
    })),
    nextCursor: null,
    hasMore: false
  })
};
createApp({
  render: () =>
    attachments
      ? h(attachments, {
          source,
          activeTab: 'files',
          showTabs: false,
          dataTestid: 'CancelFile'
        })
      : h(MessageBubbleFiles, {
          message: '',
          media,
          isMeSender: query.get('incoming') !== '1',
          isDialog: true,
          dataTestid: 'CancelFile',
          onSetSlider: (files: IMedia[], index: number) => {
            void handleNativeFileClick(files[index]);
          }
        })
})
  .use(createPinia())
  .mount('#app');
Object.assign(window, {
  fileDownloadFixture: {
    media,
    state: (index: number) => getNativeFileDownloadState(media[index])
  }
});
