<template>
  <section
    class="user-info-panel"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <header
      v-if="props.showHeader"
      class="user-info-panel__header"
      :data-testid="`${props.dataTestid}-Header`"
    >
      <div class="user-info-panel__space" />
      <h4
        class="user-info-panel__title"
        :data-testid="`${props.dataTestid}-Title`"
      >
        Информация
      </h4>
      <Button
        class="user-info-panel__close"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-CloseButton`"
        @click="emits('close')"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>

    <div class="user-info-panel__body">
      <div class="user-info-panel__avatar">
        <CachedAvatar
          :path="resolvedUser?.avatarUrl"
          :alt="resolvedUser?.avatarUrl"
          :initials="resolvedUser?.initials || 'U'"
          :is-online="isOnline"
          :data-testid="`${props.dataTestid}-Avatar`"
        />

        <span
          v-if="resolvedUser?.status?.text"
          class="user-info-panel__avatar__status"
        >
          {{ resolvedUser.status.text }}
        </span>
      </div>

      <div class="user-info-panel__identity">
        <h3
          class="user-info-panel__name"
          :data-testid="`${props.dataTestid}-Name`"
        >
          {{ resolvedUser?.initials || 'Пользователь' }}
          <EmojiIcon
            v-if="resolvedUser?.status?.icon"
            class="user-info-panel__subtitle__icon"
            :emoji="resolvedUser.status.icon"
          />
        </h3>
        <p
          class="user-info-panel__subtitle"
          :data-testid="`${props.dataTestid}-Subtitle`"
        >
          {{ role }}
        </p>
      </div>

      <div
        :class="[
          'menu-info__buttons',
          'user-info-panel__actions',
          {
            'user-info-panel__actions--single': actionButtonCount === 1,
            'user-info-panel__actions--double': actionButtonCount === 2
          }
        ]"
      >
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.large"
          class="menu-info__secondary-button user-info-panel__action-button"
          :data-testid="`${props.dataTestid}-CallButton`"
          :disabled="!canCall"
          @click="handleCall"
        >
          <CallIcon class="user-info-panel__action-icon" />
          <span>Звонок</span>
        </Button>

        <Button
          v-if="canToggleMute"
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.large"
          class="menu-info__secondary-button user-info-panel__action-button"
          :data-testid="`${props.dataTestid}-MuteButton`"
          @click="handleToggleMute"
        >
          <component
            :is="isMuted ? MuteIcon : UnmuteIcon"
            class="user-info-panel__action-icon"
          />
          <span>{{ isMuted ? 'Звук выкл.' : 'Звук вкл.' }}</span>
        </Button>

        <Button
          v-if="canOpenChat"
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.large"
          class="menu-info__secondary-button user-info-panel__action-button"
          :data-testid="`${props.dataTestid}-OpenChatButton`"
          @click="handleOpenChat"
        >
          <MessageIcon class="user-info-panel__action-icon" />
          <span>Перейти в чат</span>
        </Button>
      </div>
    </div>
  </section>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import { navigateToDialogs } from '../composables/navigation';
import { getAuthUser } from '../composables/useAuth';
import { useTopics } from '../composables/useTopics';
import { useUserInfoModal } from '../composables/useUserInfoModal';
import { getUserById, getUserLastOnline } from '../composables/useUsers';
import { getChatSDK } from '../services/useChat';
import { TopicType } from '../services/useChatSDK/types';
import { isDeletedBotUser } from '../utils/bot';
import { parseUserEx } from '../utils/parseUserEx';
import type { ITopic, IUser } from './interfaces/interfaces';
import { preloadNotoEmojiAssets } from '../composables/useEmojiStyle';
import CallIcon from './CallModal/UI/CallIcon.vue';
import CachedAvatar from './UI/CachedAvatar.vue';
import EmojiIcon from './UI/EmojiIcon.vue';
import MessageIcon from './UI/MessageIcon.vue';
import MuteIcon from './UI/MuteIcon.vue';
import UnmuteIcon from './UI/UnmuteIcon.vue';

const props = withDefaults(
  defineProps<{
    user?: IUser | null;
    topic?: ITopic | null;
    showHeader?: boolean;
    dataTestid?: string;
  }>(),
  {
    showHeader: false,
    dataTestid: 'UserInfoPanel'
  }
);

const emits = defineEmits<{
  (e: 'close'): void;
}>();

const { toggleMuteTopic } = useTopics();
const { resolveDirectTopicByUserId, handleUserInfoOpenChat } =
  useUserInfoModal();

const resolvedUser = computed(() =>
  props.user?.id ? getUserById(props.user.id) || props.user : props.user || null
);
const lastOnline = computed(() =>
  resolvedUser.value ? getUserLastOnline(resolvedUser.value) : null
);
const isCurrentUser = computed(
  () => !!resolvedUser.value?.id && getAuthUser()?.id === resolvedUser.value.id
);

const directTopic = computed(() => {
  if (!resolvedUser.value?.id) {
    return null;
  }

  if (
    props.topic?.type === TopicType.DM &&
    props.topic.user?.id === resolvedUser.value.id
  ) {
    return props.topic;
  }

  return resolveDirectTopicByUserId(resolvedUser.value.id);
});

const role = computed(() => parseUserEx(resolvedUser.value?.ex).erpRole);
const isDeletedAccount = computed(() => isDeletedBotUser(resolvedUser.value));
const isOnline = computed(
  () => !isDeletedAccount.value && !isCurrentUser.value && !lastOnline.value
);
const isMuted = computed(() => !!directTopic.value?.info?.isMute);
const canCall = computed(
  () =>
    !!resolvedUser.value?.id && !isDeletedAccount.value && !isCurrentUser.value
);
const canOpenChat = computed(
  () =>
    !!resolvedUser.value?.id && !isDeletedAccount.value && !isCurrentUser.value
);
const canToggleMute = computed(
  () => !!directTopic.value?.id && !isDeletedAccount.value
);
const actionButtonCount = computed(
  () => 1 + Number(canToggleMute.value) + Number(canOpenChat.value)
);

watch(
  () => resolvedUser.value?.status?.icon || '',
  icon => {
    preloadNotoEmojiAssets(icon ? [icon] : [], {
      highPriority: true
    });
  },
  {
    immediate: true
  }
);

const handleCall = async () => {
  const targetUser = resolvedUser.value;

  if (!canCall.value || !targetUser?.id) {
    return;
  }

  emits('close');

  let targetTopicId = directTopic.value?.id || null;

  if (!targetTopicId) {
    const sdk = getChatSDK();
    const topic = await sdk.createTopic({ peerId: targetUser.id });
    targetTopicId = topic?.id || null;
  }

  if (!targetTopicId) {
    return;
  }

  const { startLiveKitCall } = await import('../services/useLiveKit');

  await startLiveKitCall(targetUser, targetTopicId);
};

const handleToggleMute = () => {
  if (!directTopic.value) {
    return;
  }

  toggleMuteTopic(directTopic.value);
};

const handleOpenChat = async () => {
  const targetUser = resolvedUser.value;

  if (!canOpenChat.value || !targetUser?.id) {
    return;
  }

  let targetTopicId = directTopic.value?.id || null;

  if (!targetTopicId) {
    const sdk = getChatSDK();
    const topic = await sdk.createTopic({ peerId: targetUser.id });
    targetTopicId = topic?.id || null;
  }

  if (!targetTopicId) {
    return;
  }

  handleUserInfoOpenChat();
  emits('close');
  navigateToDialogs(targetTopicId);
};
</script>

<style scoped>
.user-info-panel {
  background: var(--white);
}

.user-info-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 10px;
  border-bottom: 1px solid var(--border-grey);
  padding-bottom: 10px;
}

.user-info-panel__space {
  width: 24px;
  height: 24px;
}

.user-info-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-color);
  line-height: 19px;
}

.user-info-panel__close {
  color: var(--text-light-color);
  padding: 0 !important;
  min-height: 24px !important;
  height: 24px;
}

.user-info-panel__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 10px;
}

.user-info-panel__avatar {
  position: relative;
  --size-avatar: 42.5px;
}

.user-info-panel__avatar__status {
  position: absolute;
  top: 0;
  left: 62px;
  text-align: center;
  background: var(--black2);
  color: var(--white);
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 10px;
  line-height: 12px;
}

.user-info-panel__identity {
  margin-top: 10px;
  text-align: center;
}

.user-info-panel__name {
  margin: 0;
  font-size: 18px;
  line-height: 22px;
  font-weight: 600;
  display: flex;
  gap: 5px;
  color: var(--text-color);
}

.user-info-panel__subtitle {
  margin: 5px 0 0;
  font-size: 14px;
  line-height: 17px;
  color: var(--grey6);
}

.user-info-panel__subtitle__icon {
  display: block;
  flex-shrink: 0;
}

.user-info-panel__actions {
  width: 100%;
  margin-top: 24px;
  grid-template-columns: repeat(3, 1fr);
}

.user-info-panel__actions--single {
  grid-template-columns: 1fr;
}

.user-info-panel__actions--double {
  grid-template-columns: repeat(2, 1fr);
}

.user-info-panel__action-button {
  min-height: 92px;
  width: 100%;
  gap: 10px;
}

.user-info-panel__action-button:disabled {
  opacity: 0.55;
  cursor: default;
}

.user-info-panel__action-icon {
  width: 24px;
  height: 24px;
  color: var(--grey6);
}

.user-info-panel__action-button span {
  font-size: 14px;
  line-height: 1.3;
}

@media screen and (width <= 768px) {
  .user-info-panel__body {
    padding: 10px 0 0;
  }
}
</style>
