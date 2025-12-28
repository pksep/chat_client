<template>
  <section class="chat" :data-testid="`${props.dataTestid}-Chat-Container`">
    <Loading
      v-if="state.isLoading"
      message="Загрузка чата..."
      :dataTestid="`${props.dataTestid}-Chat-Loading`"
    />
    <ContactListMobile
      :key="`contact-list-${state.chapter}`"
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
      :key="`message-list-${state.chapter}-${props.contact?.id || 'null'}`"
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
import { useNavigationService } from '../services/useNavigationService';

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  chapter: null,
  dataTestid: () => 'Chat'
});

const emits = defineEmits<IMenuEmits>();

const { navigateToTarget } = useNavigationService();

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

watch(
  () => props.contact?.conversationId,
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

const handleUnmountChapter = async (
  chapter: { nickname: string; contact: any } | string | null
): Promise<void> => {
  if (typeof chapter === 'string') {
    if (
      chapter === 'ai' ||
      chapter === 'assistant' ||
      chapter === 'channels' ||
      chapter === 'dialogs'
    ) {
      await navigateToTarget({
        type: 'view',
        view: chapter as 'ai' | 'assistant' | 'channels' | 'dialogs'
      });
    } else {
      if (props.contact) {
        await navigateToTarget(
          { type: 'contact', contact: props.contact },
          { markAsRead: false, updateMemberCount: false }
        );
      } else {
        await navigateToTarget({ type: 'reset' });
      }
    }
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.nickname) {
    if (props.contact) {
      await navigateToTarget(
        { type: 'contact', contact: props.contact },
        { markAsRead: false, updateMemberCount: false }
      );
    } else {
      await navigateToTarget({ type: 'reset' });
    }
    emits('unmount-chapter', chapter.contact.conversationId);
  } else {
    await navigateToTarget({ type: 'reset' });
    emits('unmount-chapter', null);
  }
};

watch(
  () => props.chapter,
  newChapter => {
    if (newChapter !== state.chapter) {
      state.chapter = newChapter;
    }
  }
);

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
