<template>
  <section class="chat" :data-testid="`${props.dataTestid}-Chat-Container`">
    <ContactListMobile
      class="chat__mobile"
      :user="props.user"
      :contacts="props.contacts"
      :data-testid="`${props.dataTestid}-Chat-ContactListMobile`"
      v-if="isMobile && isShowContactList(state.chapter)"
    />
    <MessageList
      v-else-if="!isShowContactList(state.chapter)"
      ref="messageListRef"
      :chapter="state.chapter"
      :baseUrl="props.baseUrl"
      :contact="props.contact"
      :user
      :data-testid="`${props.dataTestid}-Chat-MessageList`"
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
import { computed } from 'vue';
import { getTopicList } from '../composables/useTopics';
import { markAsRead } from '../services/useChat';

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  chapter: null,
  dataTestid: () => 'Chat'
});

const state = reactive({
  chapter: props.chapter,
  isLoading: true,
  conversationList: computed(() => getTopicList())
});

watch(
  () => props.chapter,
  newChapter => {
    state.chapter = newChapter;
  }
);

watch(
  () => props.contact?.id,
  (newConversationId, oldConversationId) => {
    if (newConversationId && newConversationId !== oldConversationId) {
      markAsRead(newConversationId).catch(error => {
        console.warn('Failed to mark messages as read:', error);
      });
    }
  }
);

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>(null);

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
