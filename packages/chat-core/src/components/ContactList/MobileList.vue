<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
  >
    <section v-if="props.chapter === 'assistant'">
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
        :contacts="props.contacts"
        :data-testid="`${props.dataTestid}-ContactList`"
        @unmount-click="handleChapter"
      />
    </section>
    <template v-if="props.chapter !== 'assistant'">
      <Button
        :type="ButtonTypeEnum.primary"
        @click="handleShowAccount"
        class="mobile__list-button"
      >
        <Icon :name="IconNameEnum.plus" />
      </Button>
      <NewChatMobileModal
        :open="state.showAddAccount"
        :contacts="props.contacts"
        :selected-contact-ids="state.checkUsers"
        @close-modal="handleCloseModal"
        @unmount-contact="handleNewContact"
        @unmount-checkbox="handleCheckbox"
        @unmount-click="handleOpenUser"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import Line from '../UI/Line.vue';
import ContactList from './ContactList.vue';
import type {
  IMobileListProps,
  IMobileListEmits
} from './interfaces/mobile-list';
import type { IUserProps } from '../interfaces/interfaces';
import { Button, ButtonTypeEnum, Icon, IconNameEnum } from '@pksep/yui';
import NewChatMobileModal from '../NewChat/NewChatMobileModal.vue';

const props = withDefaults(defineProps<IMobileListProps>(), {
  contacts: () => [],
  dataTestid: () => 'MobileList'
});

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>()
});

const emits = defineEmits<IMobileListEmits>();

const isButtonDisabled = computed(() => state.checkUsers.size === 0);

const handleChapter = (
  chapter: { name: string; contact: IUserProps } | string | null
): void => {
  if (typeof chapter === 'string') {
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.name) {
    emits('unmount-chapter', chapter);
  } else {
    emits('unmount-chapter', null);
  }
};

const handleShowAccount = () => {
  state.showAddAccount = true;
};

const handleCloseModal = () => {
  state.showAddAccount = false;
  state.checkUsers.clear();
};

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  if (isCheck) {
    state.checkUsers.add(contactId);
  } else {
    state.checkUsers.delete(contactId);
  }
};

const handleNewContact = (contact: IUserProps): void => {
  emits('unmount-contact', contact);
  handleCloseModal();
};

const handleOpenUser = (): void => {
  if (isButtonDisabled.value) return;
  handleCloseModal();
};
</script>
