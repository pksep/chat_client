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
      <Modal
        :open="state.showAddAccount"
        position="center"
        @close="handleCloseModal"
        class="mobile__list-modal"
      >
        <header class="mobile__list-modal__header">
          <button
            class="mobile__list-modal__header--button"
            @click="handleCloseModal"
          >
            Отмена
          </button>
          <h3 class="mobile__list-modal__header--title">Написать сообщение</h3>
        </header>
        <Line />
        <ContactSelector
          class="mobile__list-modal__contact-selector"
          is-add-one
          :contacts="props.contacts"
          :selected-contact-ids="state.checkUsers"
          @contact-select="handleNewContact"
          @checkbox-change="handleCheckbox"
          @add-click="handleOpenUser"
        />
      </Modal>
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue';
import AiIconWrapper from '../AiIconWrapper.vue';
import Line from '../Line.vue';
import ContactList from './ContactList.vue';
import type { IMobileListProps } from './interfaces/mobile-list';
import type { IMenuEmits } from '../interfaces/interfaces';
import { Modal, Button, ButtonTypeEnum, Icon, IconNameEnum } from 'sep-yui';
import ContactSelector from '../NewChat/ContactSelector.vue';
import { IUserProps } from '../interfaces/interfaces';

const props = withDefaults(defineProps<IMobileListProps>(), {
  contacts: () => [],
  dataTestid: () => 'MobileList'
});

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>()
});

const emits = defineEmits<IMenuEmits>();

const isButtonDisabled = computed(() => state.checkUsers.size === 0);

const handleChapter = (
  chapter: { name: string; contact: any } | string | null
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
