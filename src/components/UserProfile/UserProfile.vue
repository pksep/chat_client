<template>
  <div
    v-if="props.user"
    :class="['user-profile', $attrs.class]"
    @contextmenu="handleClick"
    :data-testid="`${dataTestid}-UserProfile-Container`"
    @click="handleProfileClick"
  >
    <CachedAvatar
      :path="props.user.avatarUrl"
      :alt="props.user.avatarUrl"
      class="user-profile__avatar"
      :initials="props.user.initials"
      :data-testid="`${dataTestid}-UserProfile-Avatar`"
      :is-online="
        !isWaitingConnection && !effectiveLastOnline && !isCurrentUser
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
    <ConnectionStatus v-if="!!isWaitingConnection" />
    <TypingIndicator
      v-else-if="props.typingLabel"
      class="user-profile__ex user-profile__ex--typing"
      :label="props.typingLabel"
      :data-testid="`${dataTestid}-UserProfile-Typing`"
    />
    <span
      v-else
      class="user-profile__ex"
      :class="{
        'user-profile__ex--online': !effectiveLastOnline && !isCurrentUser
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
import CachedAvatar from '../UI/CachedAvatar.vue';
import EmojiIcon from '../UI/EmojiIcon.vue';
import TypingIndicator from '../UI/TypingIndicator.vue';
import { preloadNotoEmojiAssets } from '../../composables/useEmojiStyle';
import {
  formatUserStatusText,
  normalizeUserStatus
} from '../../utils/userStatus';

const props = withDefaults(defineProps<IUserProfileProps>(), {
  dataTestid: () => 'UserProfile'
});

const effectiveUser = computed(() => getUserById(props.user.id) || props.user);
const effectiveLastOnline = computed(() => getUserLastOnline(props.user));

const isCurrentUser = computed(
  () => getAuthUser()?.id === effectiveUser.value.id
);
const isWaitingConnection = computed(() => !getHasWebsocketConnection());
const currentStatus = computed(() =>
  normalizeUserStatus(effectiveUser.value.status)
);
const currentStatusLabel = computed(() =>
  formatUserStatusText(effectiveUser.value.status)
);
const statusIcon = computed(() => currentStatus.value?.icon || '');

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
  if (isCurrentUser.value) return `@${props.user.nickname}`;
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
