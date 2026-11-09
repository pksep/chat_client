import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import CallsBotView from '../../src/components/Calls/CallsBotView.vue';
import { selectCallForBot } from '../../src/services/useCallBot';
import { TopicType } from '../../src/services/useChatSDK/types';

export const mountCallMaterialErrorPreview = (topicId: string) => {
  selectCallForBot({
    messageId: 'call-preview',
    topicId,
    roomId: 'call-material-room',
    topicType: TopicType.Group,
    displayName: 'Звонок',
    avatarInitials: 'З',
    dateLabel: '9 ноября',
    fullDateLabel: '9 ноября 2026',
    title: 'Звонок',
    duration: null,
    detailLabel: '',
    timeLabel: '12:00',
    createdAt: Date.now()
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(CallsBotView) });
  app.use(createPinia());
  app.mount(host);
};
