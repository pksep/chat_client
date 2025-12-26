<template>
  <section class="chat" :data-testid="`${props.dataTestid}-Chat-Container`">
    <Loading
      v-if="state.isLoading"
      message="Загрузка чата..."
      :dataTestid="`${props.dataTestid}-Chat-Loading`"
    />
    <ContactListMobile
      class="chat__mobile"
      :user="props.user"
      :contacts="props.contacts"
      :chapter="state.chapter"
      :data-testid="`${props.dataTestid}-Chat-ContactListMobile`"
      v-else-if="isMobile && isShowContactList(state.chapter)"
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
import Loading from './Loading.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { useTemplateRef, reactive, watch } from 'vue';
import { isShowContactList } from '../composables/useShowContactList';
import { MAX_W_MD } from '../utils/constants';
import {
  fetchConversationList,
  getConversationList,
  onSDKReady
} from '../services/useConversions';
import { computed } from 'vue';
import { onMounted } from 'vue';
import type { IMenuEmits } from './interfaces/interfaces';
import { IUserProps } from './interfaces/interfaces';
import { markAsRead } from '../services/useOpenIM';

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  chapter: null,
  dataTestid: () => 'Chat'
});

const emits = defineEmits<IMenuEmits>();

const state = reactive({
  chapter: props.chapter,
  isLoading: true,
  conversationList: computed(() => getConversationList())
});

watch(
  () => props.chapter,
  newChapter => {
    state.chapter = newChapter;
  }
);

// Watch for contact changes to mark messages as read
watch(
  () => props.contact?.conversationId,
  (newConversationId, oldConversationId) => {
    if (newConversationId && newConversationId !== oldConversationId) {
      // Mark messages as read when switching to a new conversation
      markAsRead(newConversationId).catch(error => {
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
  onSDKReady(() => {
    fetchConversationList().finally(() => {
      state.isLoading = false;
    });
  });
});

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
