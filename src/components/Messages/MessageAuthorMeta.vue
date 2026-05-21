<template>
  <div
    v-if="showMeta"
    class="message__author-meta"
    :class="{
      'message__author-meta--interactive': canOpenUserInfo(props.senderUser)
    }"
    :data-testid="props.dataTestid"
    @click.stop="handleOpenUserInfo"
  >
    <h3 v-if="props.sender" class="message__article-initals">
      {{ props.sender }}
    </h3>
    <span v-if="props.senderRole" class="message__author-role">
      {{ props.senderRole }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IUser } from '../interfaces/interfaces';
import { useUserInfoModal } from '../../composables/useUserInfoModal';

interface Props {
  sender?: string;
  senderUser?: IUser;
  senderRole?: string;
  dataTestid?: string;
}

const props = defineProps<Props>();
const { openUserInfo, canOpenUserInfo } = useUserInfoModal();

const showMeta = computed(() => Boolean(props.sender || props.senderRole));

const handleOpenUserInfo = (): void => {
  if (!props.senderUser) {
    return;
  }

  openUserInfo(props.senderUser);
};
</script>

<style scoped>
.message__author-meta--interactive {
  cursor: pointer;
}
</style>
