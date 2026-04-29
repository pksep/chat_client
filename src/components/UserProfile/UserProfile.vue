<template>
  <div
    v-if="props.user"
    :class="['user-profile', $attrs.class]"
    @contextmenu="handleClick"
    :data-testid="`${dataTestid}-UserProfile-Container`"
    @click="emits('click')"
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
      {{ props.user.initials }}
    </h3>
    <WaitConnection v-if="!!isWaitingConnection" />
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
import { computed } from 'vue';
import { IUserProfileProps } from '../interfaces/interfaces';
import { formatLastSeen } from '../../utils/dateUtils';
import { getUserLastOnline } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';
import WaitConnection from '../UI/WaitConnection.vue';
import { getHasWebsocketConnection } from '../../services/useChat';
import CachedAvatar from '../UI/CachedAvatar.vue';

const props = withDefaults(defineProps<IUserProfileProps>(), {
  dataTestid: () => 'UserProfile'
});

const effectiveLastOnline = computed(() => getUserLastOnline(props.user));

const isCurrentUser = computed(() => getAuthUser()?.id === props.user.id);
const isWaitingConnection = computed(() => !getHasWebsocketConnection());

const formattedStatus = computed(() => {
  if (isCurrentUser.value) return `@${props.user.nickname}`;
  return formatLastSeen(effectiveLastOnline.value);
});

defineOptions({
  inheritAttrs: false
});

const emits = defineEmits<{
  (e: 'unmount-click', event: MouseEvent): void;
  (e: 'click'): void;
}>();

const handleClick = (event: MouseEvent): void => {
  emits('unmount-click', event);
};
</script>
