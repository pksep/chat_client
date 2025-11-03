<template>
  <section class="chat">
    <AIListMobile
      class="chat__mobile"
      v-if="isMobile && !state.chapter"
      @unmount-chapter="handleUnmountChapter"
    />
    <MessageList
      ref="messageListRef"
      :chapter="state.chapter"
      :baseUrl="props.baseUrl"
    />
  </section>
</template>

<script lang="ts" setup>
import { useResizeState } from '../composables/useResizeState';
import MessageList from './MessageList.vue';
import AIListMobile from './ContactList/AIListMobile.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { useTemplateRef, reactive, watch } from 'vue';

const props = withDefaults(defineProps<IMessageListProps>(), {
  chapter: null
});

const emits = defineEmits(['unmount-chapter']);

const state = reactive({
  chapter: props.chapter
});

watch(
  () => props.chapter,
  newChapter => {
    state.chapter = newChapter;
  }
);

const { state: isMobile } = useResizeState(1024);

const messageListRef = useTemplateRef<any>(null);

const handleUnmountChapter = (chapter: string): void => {
  state.chapter = chapter;
  emits('unmount-chapter', chapter);
};

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
