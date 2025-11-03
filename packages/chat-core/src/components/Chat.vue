<template>
  <section class="chat">
    <AIListMobile v-if="isMobile" />
    <MessageList
      v-else-if="!props.chapter"
      ref="messageListRef"
      :chapter="props.chapter"
      :baseUrl="props.baseUrl"
    />
  </section>
</template>

<script lang="ts" setup>
import { useResizeState } from '../composables/useResizeState';
import MessageList from './MessageList.vue';
import AIListMobile from './ContactList/AIListMobile.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { useTemplateRef } from 'vue';

const props = withDefaults(defineProps<IMessageListProps>(), {
  chapter: null
});

const { state: isMobile } = useResizeState(1024);

const messageListRef = useTemplateRef<any>(null);

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
