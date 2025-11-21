<template>
  <div class="user-profile" @contextmenu="handleClick">
    <Avatar
      :url="props.avatarUrl"
      :alt="props.avatarAlt"
      class="user-profile__avatar"
      :initials="props.nickname"
    />
    <h3 class="user-profile__title">{{ props.nickname }}</h3>
    <span class="user-profile__ex">@{{ props.groupId || props.tabel }}</span>
  </div>
</template>

<script lang="ts" setup>
import { Avatar } from '@pksep/yui';
import { IUserProps } from '../interfaces/interfaces';

const props = defineProps<IUserProps>();

const emits = defineEmits<{
  (e: 'unmount-click', event: MouseEvent): void;
}>();

const handleClick = (event: MouseEvent): void => {
  emits('unmount-click', event);
};
</script>
