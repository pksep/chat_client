<template>
  <section class="chat">
    <ContactListMobile
      class="chat__mobile"
      :contacts="state.conversationList"
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
import {
  fetchConversationList,
  getConversationList
} from '../services/useConversions';
import { computed } from 'vue';
import { onMounted } from 'vue';
import type { IMenuEmits } from './interfaces/interfaces';

const props = withDefaults(defineProps<IMessageListProps>(), {
  chapter: null
});

const emits = defineEmits<IMenuEmits>();

const state = reactive({
  chapter: props.chapter,
  conversationList: computed(() => getConversationList())
});

watch(
  () => props.chapter,
  newChapter => {
    state.chapter = newChapter;
  }
);

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>(null);

const handleUnmountChapter = (
  chapter: { name: string; contact: any } | string | null
): void => {
  if (typeof chapter === 'string') {
    state.chapter = chapter;
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.name) {
    state.chapter = chapter.name;
    emits('unmount-chapter', chapter);
  } else {
    state.chapter = null;
    emits('unmount-chapter', null);
  }
};

const handleUnmountContact = (): void => {
  // emits('unmount-contact', contactId);
};

onMounted(() => {
  fetchConversationList();
});

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
