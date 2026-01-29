<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
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
  </div>

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
</template>

<script setup lang="ts">
import { reactive, computed, ref } from 'vue';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import Line from '../UI/Line.vue';
import type {
  IMobileListProps,
  IMobileListEmits
} from './interfaces/mobile-list';
import type { IUser } from '../interfaces/interfaces';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Loader,
  Modal
} from '@pksep/yui';
import NewChatMobileModal from '../NewChat/NewChatMobileModal.vue';
import TopicList from './TopicList.vue';
import { useGroup } from '../../composables/useGroup';
import { useTopics } from '../../composables/useTopics';
import { navigateToAI, useUrlWatcher } from '../../composables/navigation';
import {
  navigateToAssistant,
  navigateToDialogsList,
  navigateToGroupsList,
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
const { getTopicList, loading: loadingTopics } = useTopics();
const { getGroupList, loading: loadingGroups } = useGroup();

const contactList = computed(() => {
  const topics = getTopicList();
  return [...topics];
});

const groupList = computed(() => {
  const groups = getGroupList();
  return [...groups];
});

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>(),
  isLoading: computed(() => loadingTopics.value || loadingGroups.value)
});

const touchStartX = ref(0);
const touchStartY = ref(0);
const touchEndX = ref(0);

const SWIPE_THRESHOLD = 70;
const VERTICAL_LIMIT = 50;

const onTouchStart = (e: TouchEvent) => {
  const touch = e.changedTouches[0];
  touchStartX.value = touch.clientX;
  touchStartY.value = touch.clientY;
};

const onTouchEnd = (e: TouchEvent) => {
  const touch = e.changedTouches[0];
  touchEndX.value = touch.clientX;

  const deltaX = touchEndX.value - touchStartX.value;
  const deltaY = Math.abs(touch.clientY - touchStartY.value);

  if (Math.abs(deltaX) < SWIPE_THRESHOLD || deltaY > VERTICAL_LIMIT) {
    return;
  }

  if (deltaX < 0) {
    if (route.value.type === RouteTypes.GROUP) {
      navigateToAssistant();
    } else if (route.value.type === RouteTypes.DIALOGS) {
      navigateToGroupsList();
    }
  } else {
    if (route.value.type === RouteTypes.GROUP) {
      navigateToDialogsList();
    } else if (route.value.type === RouteTypes.ASSISTANT) {
      navigateToGroupsList();
    }
  }
};

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
