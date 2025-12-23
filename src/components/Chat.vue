<template>
  <section class="chat" :data-testid="`${props.dataTestid}-Chat-Container`">
    <ContactListMobile
      class="chat__mobile"
      :user="props.user"
      :contacts="props.contacts"
      :chapter="state.chapter"
      :data-testid="`${props.dataTestid}-Chat-ContactListMobile`"
      v-if="isMobile && isShowContactList(state.chapter)"
      @unmount-chapter="handleUnmountChapter"
      @unmount-contact="handleUnmountContact"
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
import { fetchConversationList, onSDKReady } from '../services/useConversions';
import { onMounted } from 'vue';
import type { IMenuEmits, IUserProps } from './interfaces/interfaces';
import { markAsRead } from '../services/useOpenIM';

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  chapter: null,
  dataTestid: () => 'Chat'
});

const emits = defineEmits<IMenuEmits>();

interface ChatState {
  chapter: string | null;
}

const state = reactive<ChatState>({
  chapter: props.chapter
});

watch<string | null>(
  () => props.chapter,
  newChapter => {
    state.chapter = newChapter;
  }
);

watch(
  () => props.contact?.id,
  (newContactId, oldContactId) => {
    if (newContactId && newContactId !== oldContactId) {
      markAsRead(newContactId).catch(error => {
        console.warn('Failed to mark messages as read:', error);
      });
    }
  }
);

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>(null);

const handleUnmountChapter = (
  chapter: { nickname: string; contact: any } | string | null
): void => {
  if (typeof chapter === 'string') {
    state.chapter = chapter;
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.nickname) {
    state.chapter = chapter.contact.conversationId;
    emits('unmount-chapter', state.chapter);
  } else {
    state.chapter = null;
    emits('unmount-chapter', null);
  }
};

const handleUnmountContact = (contact: IUserProps): void => {
  emits('unmount-contact', contact);
};

onMounted(() => {
  onSDKReady(fetchConversationList);
});

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
