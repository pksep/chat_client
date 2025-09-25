<template>
  <header class="chat__header">
    <UserProfile class="chat__header-profile" />
    <div class="chat__header-buttons">
      <Button :type="ButtonTypeEnum.ghost" :size="SizesEnum.small">
        <Icon class="small-icon" :name="IconNameEnum.search" />
      </Button>
      <Button :type="ButtonTypeEnum.ghost" :size="SizesEnum.small">
        <Icon class="small-icon" :name="IconNameEnum.moreVertical" />
      </Button>
    </div>
  </header>
</template>

<script lang="ts" setup>
import UserProfile from './UserProfile/UserProfile.vue';
import { Button, Icon, IconNameEnum, ButtonTypeEnum, SizesEnum } from 'sep-yui';
</script>

<style scoped>
.chat__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--white);
  padding: 7.5px 8px;
  border-bottom-width: 0.5px;
  border-bottom-style: solid;
  border-bottom-color: var(--border-grey);
}

.chat__header-buttons {
  display: flex;
  gap: 10px;
  margin-right: 8px;
}

.user-profile.chat__header-profile {
  --size-avatar: 40px;
  --font-size-nickname: 12px;
  margin-left: 8px;
  row-gap: 2px;
}

:deep(button.button-yui-kit) {
  padding-block: 10.5px;
}
</style>
