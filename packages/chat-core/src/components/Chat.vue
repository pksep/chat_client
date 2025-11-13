<template>
  <section class="chat">
    <template v-if="isMobile">
      <AIListMobile
        class="chat__mobile"
        v-if="!state.chapter"
        @unmount-chapter="handleUnmountChapter"
      />
      <ContactListMobile
        class="chat__mobile"
        v-else-if="isShowContactList"
        @unmount-chapter="handleUnmountChapter"
      />
    </template>
    <MessageList
      v-else-if="!isShowContactList"
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
import AIListMobile from './ContactList/AIListMobile.vue';
import ContactListMobile from './ContactList/MobileList.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { useTemplateRef, reactive, watch, computed } from 'vue';
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

const isShowContactList = computed(
  () => state.chapter === 'channels' || state.chapter === 'dialogs'
);

const messageListRef = useTemplateRef<any>(null);

const handleUnmountChapter = (chapter: string): void => {
  state.chapter = chapter;
  emits('unmount-chapter', chapter);
};

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
