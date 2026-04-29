<template>
  <div
    :class="['user-profile', $attrs.class]"
    @contextmenu="handleClick"
    :data-testid="`${dataTestid}-UserProfile-Container`"
  >
    <CachedAvatar
      :path="props.topic.group?.avatarUrl"
      :alt="props.topic.group?.avatarUrl || 'group-avatar'"
      class="user-profile__avatar"
      :initials="props.topic.group?.title || 'G'"
      :data-testid="`${dataTestid}-UserProfile-Avatar`"
    />
    <h3
      class="user-profile__title"
      :data-testid="`${dataTestid}-UserProfile-Title`"
    >
      {{ props.topic.group?.title || 'Group' }}
    </h3>
    <WaitConnection v-if="!!isWaitingConnection" />
    <span
      v-else
      class="user-profile__ex"
      :data-testid="`${dataTestid}-UserProfile-Ex`"
    >
      {{ props.topic?.members?.length || 0 }}
      {{ getParticipantForm(props.topic?.members?.length) }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import { IGroupProfileProps } from '../interfaces/interfaces';
import { getHasWebsocketConnection } from '../../services/useChat';
import { computed } from 'vue';
import WaitConnection from '../UI/WaitConnection.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';

const props = withDefaults(defineProps<IGroupProfileProps>(), {
  dataTestid: 'GroupProfile',
  topic: () => null
});

const isWaitingConnection = computed(() => !getHasWebsocketConnection());

defineOptions({
  inheritAttrs: false
});

const getParticipantForm = (num: number = 0): string => {
  const absNum = Math.abs(num);
  const lastTwoDigits = absNum % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'участников';
  }
  const lastDigit = absNum % 10;
  if (lastDigit === 1) {
    return 'участник';
  } else if (lastDigit >= 2 && lastDigit <= 4) {
    return 'участника';
  } else {
    return 'участников';
  }
};

const emits = defineEmits<{
  (e: 'unmount-click', event: MouseEvent): void;
}>();

const handleClick = (event: MouseEvent): void => {
  emits('unmount-click', event);
};
</script>
