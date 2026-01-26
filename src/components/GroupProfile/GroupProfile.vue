<template>
  <div
    :class="['user-profile', $attrs.class]"
    @contextmenu="handleClick"
    :data-testid="`${dataTestid}-UserProfile-Container`"
  >
    <Avatar
      :url="`${config.CHAT_PATH_TO_FILE_CDN}/${props.topic.group?.avatarUrl}`"
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
    <span
      class="user-profile__ex"
      :data-testid="`${dataTestid}-UserProfile-Ex`"
    >
      {{ props.topic?.members?.length || 0 }}
      {{ getParticipantForm(props.topic?.members?.length) }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import { Avatar } from '@pksep/yui';
import { IGroupProfileProps } from '../interfaces/interfaces';
import { getConfig } from '../../services/useConfig';

const props = withDefaults(defineProps<IGroupProfileProps>(), {
  dataTestid: 'GroupProfile',
  topic: () => null
});

const config = getConfig();

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
