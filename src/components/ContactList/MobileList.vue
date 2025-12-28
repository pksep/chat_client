<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
  >
    <Loading
      v-if="state.isLoading"
      message="Загрузка списка..."
      :dataTestid="`${props.dataTestid}-MobileList-Loading`"
    />
    <section v-else-if="props.chapter === 'assistant'">
      <button
        class="menu__user-assistant"
        @click="handleChapter('ai')"
        :data-testid="`${props.dataTestid}-AIAssistant-Button`"
      >
        <AiIconWrapper :data-testid="`${props.dataTestid}-AIAssistant-Icon`" />
        <h3
          class="menu__user-assistant-title"
          :data-testid="`${props.dataTestid}-AIAssistant-Title`"
        >
          AI Ассистент
        </h3>
      </button>
      <Line
        class="menu__user-line"
        :data-testid="`${props.dataTestid}-AIAssistant-Line`"
      />
    </section>

    <section
      v-else
      class="chat-list"
      role="region"
      aria-label="Contact list"
      :data-testid="`${props.dataTestid}-ChatList-Section`"
    >
      <ContactList
        :contacts="
          props.chapter === 'dialogs' ? state.contactList : state.groupList
        "
        :data-testid="`${props.dataTestid}-ContactList`"
        @unmount-click="handleChapter"
        @unmount-contact="handleContactSelect"
      />
    </section>
    <Button
      :type="ButtonTypeEnum.primary"
      @click="handleShowAccount"
      :disabled="props.chapter === 'assistant' || state.isLoading"
      class="mobile__list-button"
    >
      <Icon :name="IconNameEnum.plus" />
    </Button>
    <template v-if="props.chapter !== 'assistant'">
      <NewChatMobileModal
        :open="state.showAddAccount"
        :contacts="props.contacts"
        :is-add-one="props.chapter !== 'channels'"
        :selected-contact-ids="state.checkUsers"
        @unmount-close="handleCloseModal"
        @unmount-contact="handleNewContact"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import Line from '../UI/Line.vue';
import ContactList from './ContactList.vue';
import Loading from '../Loading.vue';
import type {
  IMobileListProps,
  IMobileListEmits
} from './interfaces/mobile-list';
import type { IUserProps } from '../interfaces/interfaces';
import { Button, ButtonTypeEnum, Icon, IconNameEnum } from '@pksep/yui';
import NewChatMobileModal from '../NewChat/NewChatMobileModal.vue';
import { getConversationList } from '../../services/useConversions';
import { getGroupList } from '../../services/useGroup';

const props = withDefaults(defineProps<IMobileListProps>(), {
  contacts: () => [],
  dataTestid: () => 'MobileList'
});

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>(),
  isLoading: true,
  contactList: computed(() => getConversationList()),
  groupList: computed(() => getGroupList())
});

import { watch } from 'vue';

watch(
  [() => getConversationList(), () => getGroupList()],
  ([convList, groupList]) => {
    if (state.isLoading && (convList.length > 0 || groupList.length > 0)) {
      state.isLoading = false;
    }
  },
  { immediate: true }
);

const emits = defineEmits<IMobileListEmits>();

const handleChapter = (
  chapter: { nickname: string; contact: IUserProps } | string | null
): void => {
  if (typeof chapter === 'string') {
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.contact.id) {
    emits('unmount-chapter', chapter);
  } else {
    emits('unmount-chapter', null);
  }
};

const handleContactSelect = (contact: IUserProps): void => {
  emits('unmount-chapter', {
    nickname: contact.nickname || contact.conversationId,
    contact
  });
};

const handleShowAccount = () => {
  state.showAddAccount = true;
};

const handleCloseModal = () => {
  state.showAddAccount = false;
  state.checkUsers.clear();
};

const handleNewContact = (contact: IUserProps): void => {
  emits('unmount-contact', contact);
  handleChapter({
    nickname: contact.nickname || contact.conversationId,
    contact
  });
  handleCloseModal();
};
</script>
