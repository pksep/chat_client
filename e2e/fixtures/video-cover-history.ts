import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/chat-container.css';
import MessageBubble from '../../src/components/Messages/MessageBubble.vue';
import { setConfig } from '../../src/services/useConfig';
import type { IMessage } from '../../src/components/interfaces/interfaces';

export const mountVideoHistoryMessage = (message: IMessage): void => {
  setConfig({
    CHAT_PATH_TO_FILE_CDN: `${location.origin}/e2e/ios-api/media/object/`
  });
  createApp({
    render: () =>
      h(
        'div',
        {
          'data-message-id': message.id,
          style: 'padding:24px;max-width:320px'
        },
        [
          h(MessageBubble, {
            messageId: message.id,
            topicId: message.topicId,
            message: message.text || '',
            media: message.media,
            isDialog: true,
            isMeSender: true,
            dataTestid: 'VideoCoverHistory'
          })
        ]
      )
  })
    .use(createPinia())
    .mount('#app');
};
