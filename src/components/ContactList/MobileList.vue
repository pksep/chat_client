<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
  >
    <template v-if="state.isLoading">
      <Modal
        :open="state.isLoading"
        position="center"
        width="150px"
        height="160px"
      >
        <Loader :dataTestid="`${props.dataTestid}-ChatContainer-Loading`" />
      </Modal>
    </template>
    <section v-else-if="isAssistantRoute">
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
      v-else-if="route.type"
      class="chat-list"
      role="region"
      aria-label="Contact list"
      :data-testid="`${props.dataTestid}-ChatList-Section`"
    >
      <TopicList
        :topics="isDialogsRoute ? contactList : groupList"
        :data-testid="`${props.dataTestid}-ContactList`"
        @unmount-contact="handleContactSelect"
      />
    </section>
    <Button
      :type="ButtonTypeEnum.primary"
      @click="handleShowAccount"
      :disabled="isAssistantRoute || state.isLoading"
      class="mobile__list-button"
    >
      <Icon :name="IconNameEnum.plus" />
    </Button>
    <template v-if="!isAssistantRoute">
      <NewChatMobileModal
        :open="state.showAddAccount"
        :contacts="[]"
        :is-add-one="!isGroupRoute"
        :selected-contact-ids="state.checkUsers"
        @unmount-close="handleCloseModal"
        @unmount-contact="handleNewContact"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import Line from '../UI/Line.vue';
import type {
  IMobileListProps,
  IMobileListEmits
} from './interfaces/mobile-list';
import type { IUser } from '../interfaces/interfaces';
import { Button, ButtonTypeEnum, Icon, IconNameEnum, Loader } from '@pksep/yui';
import NewChatMobileModal from '../NewChat/NewChatMobileModal.vue';
import TopicList from './TopicList.vue';
import { useGroup } from '../../composables/useGroup';
import { useTopics } from '../../composables/useTopics';
import { navigateToAI, useUrlWatcher } from '../../composables/navigation';
import {
  RouteType,
  RouteTypes
} from '../../composables/navigation/useUrlRouting';

const route = useUrlWatcher();

const isAssistantRoute = computed(
  () => route.value?.type === RouteTypes.ASSISTANT
);
const isDialogsRoute = computed(() => route.value?.type === RouteTypes.DIALOGS);
const isGroupRoute = computed(() => route.value?.type === RouteTypes.GROUP);

const props = withDefaults(defineProps<IMobileListProps>(), {
  dataTestid: () => 'MobileList'
});

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>(),
  isLoading: true
});

const contactList = computed(() => {
  const { getTopicList } = useTopics();
  const topics = getTopicList();
  return [...topics];
});

const groupList = computed(() => {
  const { getGroupList } = useGroup();
  const groups = getGroupList();
  return [...groups];
});

watch(
  [() => contactList.value, () => groupList.value],
  ([convList, groupList]) => {
    if (state.isLoading && (convList.length > 0 || groupList.length > 0)) {
      state.isLoading = false;
    }
  },
  { immediate: true }
);

const handleChapter = (route: RouteType) => {
  if (route === RouteTypes.AI) {
    navigateToAI();
  }
};

const emits = defineEmits<IMobileListEmits>();

const handleContactSelect = (): void => {};

const handleShowAccount = () => {
  state.showAddAccount = true;
};

const handleCloseModal = () => {
  state.showAddAccount = false;
  state.checkUsers.clear();
};

const handleNewContact = (contact: IUser): void => {
  emits('unmount-contact', contact);
  handleCloseModal();
};
</script>
