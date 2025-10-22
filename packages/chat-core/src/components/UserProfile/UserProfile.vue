<template>
  <div class="user-profile" @contextmenu="handleClick">
    <Avatar
      :url="props.avatarUrl"
      :alt="props.avatarAlt"
      class="user-profile__avatar"
      :initials="props.nickname"
    />
    <h3 class="user-profile__title">{{ props.name }}</h3>
    <span class="user-profile__nickname">{{ props.nickname }}</span>
  </div>
</template>

<script lang="ts" setup>
import { Avatar } from 'sep-yui';
import { IUserProps } from '../interfaces/interfaces';

const props = defineProps<IUserProps>();

console.log(props);

const emits = defineEmits<{
  (e: 'unmount-click', event: MouseEvent): void;
}>();

const handleClick = (event: MouseEvent): void => {
  emits('unmount-click', event);
};
</script>

<style scoped>
.user-profile {
  --size-avatar: 50px;
  display: grid;
  align-items: center;
  grid-template-columns: var(--size-avatar) auto;
  column-gap: 10px;
  grid-template-areas:
    'avatar title'
    'avatar description';
}

.user-profile__avatar {
  grid-area: avatar;
}

.user-profile__title {
  grid-area: title;
  color: var(--text-black);
  font-size: var(--font-size-title, 16px);
}

.user-profile__nickname {
  font-size: var(--font-size-nickname, 16px);
  color: var(--text-grey);
  margin-top: -7px;
  grid-area: description;
}
</style>
