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
import {
  fetchConversationList,
  getConversationList,
  onSDKReady
} from '../services/useConversions';
import { computed } from 'vue';
import { onMounted } from 'vue';
import type { IMenuEmits } from './interfaces/interfaces';
import { IUserProps } from './interfaces/interfaces';

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
  chapter: { nickname: string; contact: any } | string | null
): void => {
  if (typeof chapter === 'string') {
    state.chapter = chapter;
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.nickname) {
    state.chapter = chapter.nickname;
    emits('unmount-chapter', chapter.nickname);
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
