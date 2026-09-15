import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import ForwardModal from '../../src/components/Messages/ForwardModal.vue';
import { authedUser } from '../../src/composables/useAuth';
import { setTopics } from '../../src/composables/useTopics';
import { emojiDirective } from '../../src/directives/emoji';
import type {
  IMessage,
  ITopic,
  IUser
} from '../../src/components/interfaces/interfaces';
import '../../src/assets/chat-container.css';

const createLastMessage = (topicId: string, index: number): IMessage =>
  ({
    id: `${topicId}-last-message`,
    topicId,
    text: `Готово 🚀 Сообщение ${index + 1}`,
    type: 'TEXT',
    senderUserId: `forward-peer-${index}`,
    createdAt: new Date(Date.UTC(2026, 8, 14, 12, 0, index)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 14, 12, 0, index)).toISOString(),
    status: 'READ',
    media: [],
    reactions: [],
    messageRead: [],
    isReadByMe: true
  }) as IMessage;

export async function mountForwardModalFixture(topicCount = 28) {
  const user = {
    id: 'forward-user',
    name: 'Тест',
    surname: 'Пересылки',
    initials: 'ТП'
  } as IUser;
  authedUser.value = user;

  const favoriteTopic = {
    id: 'forward-favorite',
    type: 'DM',
    name: 'Избранное',
    isFavorite: true,
    user,
    members: [user],
    lastMessage: createLastMessage('forward-favorite', 0)
  } as ITopic;
  const regularTopics = Array.from({ length: topicCount }, (_, index) => {
    const peer = {
      id: `forward-peer-${index}`,
      name: `Получатель ${index + 1}`,
      surname: 'Тестовый',
      initials: `П${index + 1}`
    } as IUser;

    return {
      id: `forward-topic-${index}`,
      type: 'DM',
      name: `${peer.name} ${peer.surname}`,
      user: peer,
      members: [user, peer],
      lastMessage: createLastMessage(`forward-topic-${index}`, index)
    } as ITopic;
  });

  setTopics([favoriteTopic, ...regularTopics]);

  const app = createApp({
    render: () =>
      h(ForwardModal, {
        open: true,
        dataTestid: 'ForwardHarness'
      })
  });
  app.use(createPinia());
  app.directive('emoji', emojiDirective);
  app.mount('#app');
  await nextTick();

  return {
    app,
    favoriteTopicId: favoriteTopic.id,
    topicCount
  };
}
