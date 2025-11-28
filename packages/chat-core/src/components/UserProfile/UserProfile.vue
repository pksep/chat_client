<template>
  <div class="user-profile" @contextmenu="handleClick">
    <Avatar
      :url="props.avatarUrl"
      :alt="props.avatarAlt"
      class="user-profile__avatar"
      :initials="props.nickname"
    />
    <h3 class="user-profile__title">{{ props.nickname }}</h3>
    <span class="user-profile__ex">
      <template v-if="props.membersLength">
        {{ props.membersLength }} {{ getParticipantForm(props.membersLength) }}
      </template>
      <template v-else> @{{ props.tabel }} </template>
    </span>
  </div>
</template>

<script lang="ts" setup>
import { Avatar } from '@pksep/yui';
import { IUserProps } from '../interfaces/interfaces';

const props = defineProps<IUserProps>();

const getParticipantForm = (num: number): string => {
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
