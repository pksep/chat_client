<template>
  <div
    v-if="props.user"
    :class="['user-profile', $attrs.class]"
    @contextmenu="handleClick"
    :data-testid="`${dataTestid}-UserProfile-Container`"
    @click="handleProfileClick"
  >
    <component
      :is="isBot ? BotAvatar : CachedAvatar"
      :path="props.user.avatarUrl"
      :alt="props.user.avatarUrl"
      class="user-profile__avatar"
      :initials="props.user.initials"
      :data-testid="`${dataTestid}-UserProfile-Avatar`"
      :is-online="
        !isWaitingConnection &&
        !isDeletedAccount &&
        (isBot || (!effectiveLastOnline && !isCurrentUser))
      "
    />

    <h3
      class="user-profile__title"
      :data-testid="`${dataTestid}-UserProfile-Title`"
    >
      <span class="user-profile__title-text">{{ props.user.initials }}</span>
      <Tooltip
        v-if="statusIcon && currentStatusLabel"
        :hint="currentStatusLabel"
        position="bottom-center"
        type="black"
        size="small"
        :data-testid="`${dataTestid}-UserProfile-StatusTooltip`"
      >
        <EmojiIcon class="user-profile__title-status" :emoji="statusIcon" />
      </Tooltip>
    </h3>
    <span
      v-if="props.description !== undefined"
      class="user-profile__ex"
      :data-testid="`${dataTestid}-UserProfile-Ex`"
    >
      {{ props.description }}
    </span>
    <ConnectionStatus
      v-else-if="!!isWaitingConnection && !shouldHideStatusLine"
    />
    <TypingIndicator
      v-else-if="props.typingLabel && !shouldHideStatusLine"
      class="user-profile__ex user-profile__ex--typing"
      :label="props.typingLabel"
      :data-testid="`${dataTestid}-UserProfile-Typing`"
    />
    <span
      v-else-if="!shouldHideStatusLine"
      class="user-profile__ex"
      :class="{
        'user-profile__ex--online':
          !isDeletedAccount && !effectiveLastOnline && !isCurrentUser
      }"
      :data-testid="`${dataTestid}-UserProfile-Ex`"
    >
      {{ formattedStatus }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import { Tooltip } from '@pksep/yui';
import { IUserProfileProps } from '../interfaces/interfaces';
import { formatLastSeen } from '../../utils/dateUtils';
import { getUserById, getUserLastOnline } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';
import ConnectionStatus from '../UI/ConnectionStatus.vue';
import { getHasWebsocketConnection } from '../../services/useChat';
import { useDelayedConnectionStatus } from '../../composables/useDelayedConnectionStatus';
import CachedAvatar from '../UI/CachedAvatar.vue';
import BotAvatar from '../UI/BotAvatar.vue';
import EmojiIcon from '../UI/EmojiIcon.vue';
import TypingIndicator from '../UI/TypingIndicator.vue';
import { preloadNotoEmojiAssets } from '../../composables/useEmojiStyle';
import {
  formatUserStatusText,
  normalizeUserStatus
} from '../../utils/userStatus';
import { getBotUsername, isBotUser, isDeletedBotUser } from '../../utils/bot';

const props = withDefaults(defineProps<IUserProfileProps>(), {
  dataTestid: () => 'UserProfile',
  hideDeletedAccountStatus: false
});

const effectiveUser = computed(() =>
  props.user ? getUserById(props.user.id) || props.user : null
);
const effectiveLastOnline = computed(() =>
  props.user ? getUserLastOnline(props.user) : null
);

const isCurrentUser = computed(
  () =>
    !!effectiveUser.value?.id && getAuthUser()?.id === effectiveUser.value.id
);
const isWaitingConnection = useDelayedConnectionStatus(
  () => !getHasWebsocketConnection()
);
const currentStatus = computed(() =>
  normalizeUserStatus(effectiveUser.value?.status)
);
const currentStatusLabel = computed(() =>
  formatUserStatusText(effectiveUser.value?.status)
);
const statusIcon = computed(() => currentStatus.value?.icon || '');
const isBot = computed(() => isBotUser(effectiveUser.value));
const isDeletedAccount = computed(() => isDeletedBotUser(effectiveUser.value));
const shouldHideStatusLine = computed(
  () => props.hideDeletedAccountStatus && isDeletedAccount.value
);

watch(
  statusIcon,
  icon => {
    preloadNotoEmojiAssets(icon ? [icon] : [], {
      highPriority: true
    });
  },
  {
    immediate: true
  }
);

const formattedStatus = computed(() => {
  if (isDeletedAccount.value) {
    return 'Оффлайн';
  }

  if (isBot.value) {
    return `@${getBotUsername(effectiveUser.value)}`;
  }

  if (isCurrentUser.value) return `@${effectiveUser.value?.nickname || ''}`;
  return formatLastSeen(effectiveLastOnline.value);
});

defineOptions({
  inheritAttrs: false
});

const emits = defineEmits<{
  (e: 'unmount-click', event: MouseEvent): void;
  (e: 'click', event: MouseEvent): void;
}>();

const handleClick = (event: MouseEvent): void => {
  emits('unmount-click', event);
};

const handleProfileClick = (event: MouseEvent): void => {
  emits('click', event);
};
</script>

<style scoped>
.user-profile--interactive {
  cursor: pointer;
}

.user-profile__ex--typing {
  color: var(--primary-color);
}
</style>
