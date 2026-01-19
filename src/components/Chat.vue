<template>
  <section class="chat" :data-testid="`${props.dataTestid}-Chat-Container`">
    <ContactListMobile
      v-if="isMobile && isShowContactList(route.type, route.id || null)"
      class="chat__mobile"
      :data-testid="`${props.dataTestid}-Chat-ContactListMobile`"
    />
    <MessageList
      v-else-if="route.id"
      ref="messageListRef"
      :baseUrl="props.baseUrl"
      :contact="props.contact"
      :user="authUser"
      :data-testid="`${props.dataTestid}-Chat-MessageList`"
    />
  </section>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import MessageList from './MessageList.vue';
import ContactListMobile from './ContactList/MobileList.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { isShowContactList } from '../composables/useShowContactList';
import { MAX_W_MD } from '../utils/constants';
import { useUrlWatcher } from '../composables/navigation';
import { getAuthUser } from '../composables/useAuth';

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  dataTestid: 'Chat'
});

const authUser = computed(() => getAuthUser());

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>(null);

const route = useUrlWatcher();

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
