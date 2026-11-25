import { createApp, h } from 'vue';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageBubbleFiles from '../../src/components/Messages/MessageBubbleFiles.vue';
import {
  handleNativeFileClick,
  getNativeFileDownloadState
} from '../../src/services/useNativeFile';
import { setConfig } from '../../src/services/useConfig';
import type { IMedia } from '../../src/components/interfaces/interfaces';
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
createApp({
  render: () =>
    h(MessageBubbleFiles, {
      message: '',
      media,
      isMeSender: query.get('incoming') !== '1',
      isDialog: true,
      dataTestid: 'CancelFile',
      onSetSlider: (files: IMedia[], index: number) => {
        void handleNativeFileClick(files[index]);
      }
    })
}).mount('#app');
Object.assign(window, {
  fileDownloadFixture: {
    media,
    state: (index: number) => getNativeFileDownloadState(media[index])
  }
});
