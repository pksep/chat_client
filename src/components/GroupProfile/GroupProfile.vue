<template>
  <div
    class="user-profile"
    @contextmenu="handleClick"
    :data-testid="`${dataTestid}-UserProfile-Container`"
  >
    <Avatar
      :url="props.group.avatarUrl"
      :alt="props.group.avatarUrl"
      class="user-profile__avatar"
      :initials="props.group.title"
      :data-testid="`${dataTestid}-UserProfile-Avatar`"
    />
    <h3
      class="user-profile__title"
      :data-testid="`${dataTestid}-UserProfile-Title`"
    >
      {{ props.group.title }}
    </h3>
    <span
      class="user-profile__ex"
      :data-testid="`${dataTestid}-UserProfile-Ex`"
    >
      {{ props.membersLength }} {{ getParticipantForm(props.membersLength) }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import { Avatar } from '@pksep/yui';
import { IGroupProfileProps } from '../interfaces/interfaces';

const props = withDefaults(defineProps<IGroupProfileProps>(), {
  dataTestid: () => 'GroupProfile'
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
