<template>
  <div class="menu__user-assistant-icon">
    <AiIcon />
  </div>
</template>

<script setup lang="ts">
import AiIcon from './AiIcon.vue';
</script>

<style scoped>
.menu__user-assistant-icon {
  display: grid;
  background-color: var(--blue9);
  color: var(--blue1);
  border-radius: 50%;
  padding: 7px;
  & svg {
    font-size: 16px;
  }
}
</style>
