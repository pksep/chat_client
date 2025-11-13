<template>
  <section class="chat">
    <ContactListMobile
      class="chat__mobile"
      :contacts="props.contacts"
      :chapter="state.chapter"
      v-if="isMobile && isShowContactList(state.chapter)"
      @unmount-chapter="handleUnmountChapter"
      @unmount-contact="handleUnmountContact"
    />
    <MessageList
      v-else-if="!isShowContactList(state.chapter)"
      ref="messageListRef"
      :chapter="state.chapter"
      :baseUrl="props.baseUrl"
      :contactId
      :conversionId
    />
  </section>
</template>

<script lang="ts" setup>
import { useResizeState } from '../composables/useResizeState';
import MessageList from './MessageList.vue';
import ContactListMobile from './ContactList/MobileList.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { useTemplateRef, reactive, watch } from 'vue';
import { isShowContactList } from '../composables/useShowContactList';
import { MAX_W_MD } from '../utils/constants';

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

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>(null);

const handleUnmountChapter = (chapter: string): void => {
  state.chapter = chapter;
  emits('unmount-chapter', chapter);
};

const handleUnmountContact = (): void => {
  // emits('unmount-contact', contactId);
};

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
