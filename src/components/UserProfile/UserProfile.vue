<template>
  <div class="user-profile">
    <Avatar
      url="/avatar-user.png"
      alt="avatar of user"
      class="user-profile__avatar"
    />
    <h3 class="user-profile__title">Zakk Wylde</h3>
    <span class="user-profile__nickname">@wyldetheguy</span>
  </div>
</template>

<script lang="ts" setup>
import Avatar from './Avatar.vue';
</script>

<style scoped>
.user-profile {
  --size-avatar: 50px;
  display: grid;
  align-items: center;
  grid-template-columns: var(--size-avatar) auto;
  column-gap: 10px;
  row-gap: 4px;
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
  grid-area: description;
}
</style>
