<template>
  <section class="chat" :data-testid="`${props.dataTestid}-Chat-Container`">
    <PinnedMessages
      v-if="route.id"
      @unmount-set-selected-message="scrollToMessage"
    />
    <ContactListMobile
      v-if="isMobile && !route.id"
      class="chat__mobile"
      :data-testid="`${props.dataTestid}-Chat-ContactListMobile`"
    />
    <MessageList
      v-else-if="route.id"
      ref="messageListRef"
      :baseUrl="props.baseUrl"
      :contact="props.contact"
      :user="authUser"
      :show-update-banner="props.showUpdateBanner"
      :update-action-label="props.updateActionLabel"
      :is-update-action-disabled="props.isUpdateActionDisabled"
      :on-update-click="props.onUpdateClick"
      :on-dismiss-update-banner="props.onDismissUpdateBanner"
      :data-testid="`${props.dataTestid}-Chat-MessageList`"
    />
    <div class="chat__unselected-topic" v-else>
      <img src="/images/messages.svg" alt="messages" />
      <p>Выберите чат</p>
    </div>
    <ShareSelectionOverlay v-if="isMobile" />
  </section>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import MessageList from './MessageList.vue';
import ContactListMobile from './ContactList/MobileList.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { MAX_W_MD } from '../utils/constants';
import { useUrlWatcher } from '../composables/navigation';
import { getAuthUser } from '../composables/useAuth';
import PinnedMessages from './Messages/PinnedMessages.vue';
import { IMessage } from './interfaces/interfaces';
import ShareSelectionOverlay from './ShareSelectionOverlay.vue';

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  dataTestid: 'Chat'
});

const authUser = computed(() => getAuthUser());

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>('messageListRef');

const route = useUrlWatcher();

const scrollToMessage = (message: IMessage) => {
  messageListRef.value?.scrollToMessage(message);
};

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
