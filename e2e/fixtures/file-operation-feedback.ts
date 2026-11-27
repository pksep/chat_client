import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { MediaType } from '@pksep/zod-shared-chat';
import MessageBubble from '../../src/components/Messages/MessageBubble.vue';
import NotificationStack from '../../src/components/UI/NotificationStack.vue';
import { setConfig } from '../../src/services/useConfig';
import { setAuthUser } from '../../src/composables/useAuth';
import { useTopics } from '../../src/composables/useTopics';
import { saveMessagesToLocal } from '../../src/services/useMessages';
import { registerNativeFileBridge } from '../../src/services/native-file-bridge';
import {
  showNotification,
  closeNotification,
  startOperationNotification
} from '../../src/composables/useNotifications';
import { MessageTypeEnum } from '@pksep/yui';
import '../../src/assets/chat-container.css';
import '@fontsource-variable/inter';

setConfig({
  CHAT_PATH_TO_FILE_CDN: `${location.origin}/api/media/object`,
  CHAT_API_DOMAIN: `${location.origin}/operation-api`
});
setAuthUser({ id: 'fixture-me', initials: 'Вы' } as any);
useTopics().setTopics([
  { id: 'operation-fixture-topic', type: 'DM', name: 'Проверка файлов' } as any
]);
registerNativeFileBridge();
const photos = Array.from({ length: 4 }, (_, index) => ({
  id: `compressed-image-${index}`,
  path: `compressed-image-${index}.webp`,
  originName: 'image.png',
  type: MediaType.Image,
  size: [595564, 126949, 179173, 131588][index],
  ex: { width: 200, height: 200, previewWidth: 132, previewHeight: 132 }
}));
const file = {
  id: 'operation-text-file',
  path: 'operation-file.txt',
  originName: 'Отчёт.txt',
  size: 1024,
  type: MediaType.File
};
const rows = [
  { id: 'photo-message', text: '<p>через скачать всё нет</p>', media: photos },
  { id: 'text-message', text: '<p>Текст для копирования</p>', media: [] },
  { id: 'file-message', text: '', media: [file] }
].map(row => ({
  ...row,
  topicId: 'operation-fixture-topic',
  senderUserId: 'fixture-me',
  status: 'READ',
  createdAt: '2026-11-27T09:00:00.000Z',
  isSystem: false
}));
saveMessagesToLocal('operation-fixture-topic', rows as any, {
  skipPersist: true
});
document.documentElement.classList.toggle(
  'theme-dark',
  new URLSearchParams(location.search).has('dark')
);
document.body.style.padding = '40px';
document.body.style.background = 'var(--surface-main)';
document.body.style.color = 'var(--text-primary)';
if (new URLSearchParams(location.search).has('startup')) {
  showNotification({
    title: '',
    description: 'Файл подготовлен до открытия интерфейса',
    type: MessageTypeEnum.success
  });
  showNotification({
    title: '',
    description: 'Вторая операция подготовлена',
    type: MessageTypeEnum.info
  });
}
createApp({
  render: () => [
    h(
      'main',
      { style: 'max-width:600px;display:grid;gap:40px' },
      rows.map(row =>
        h(MessageBubble, {
          message: row.text,
          messageId: row.id,
          topicId: row.topicId,
          media: row.media,
          time: '12:12',
          isRead: true,
          isMeSender: true,
          isDialog: true,
          messageStatus: row.status,
          dataTestid: row.id
        })
      )
    ),
    h(NotificationStack)
  ]
})
  .use(createPinia())
  .mount('#app');
Object.assign(window, {
  fileOperationFixture: {
    photos,
    closeNotification,
    startOperationNotification,
    notification: (type: MessageTypeEnum, description: string) =>
      showNotification({ title: '', type, description })
  }
});
