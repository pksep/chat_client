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

    <section
      class="chat-list"
      role="region"
      aria-label="Contact list"
      :data-testid="`${props.dataTestid}-ChatList-Section`"
    >
      <TopicList
        :topics="contactList"
        :data-testid="`${props.dataTestid}-ContactList`"
        @unmount-contact="handleContactSelect"
      />
    </section>
    <Button
      :type="ButtonTypeEnum.primary"
      @click="evt => openActivePopover('plusMenu', evt as MouseEvent)"
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

    <ContextMenu
      :visible="!!isOpen['plusMenu']"
      :position="{ ...position, y: position.y - 80 }"
      @unmount-close="closeActivePopover('plusMenu')"
      @click="closeActivePopover('plusMenu')"
      :data-testid="`${dataTestid}-MessageBubble-ContextMenu`"
    >
      <Button
        @click="handleShowAccount(TopicType.DM)"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        :data-testid="`${dataTestid}-MessageBubble-ReplyButton`"
      >
        <MessageIcon /> Создать диалог
      </Button>
      <Button
        @click="handleShowAccount(TopicType.Group)"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        :data-testid="`${dataTestid}-MessageBubble-EditButton`"
      >
        <GroupIcon /> Создать группу
      </Button>
    </ContextMenu>
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
  Modal,
  SizesEnum
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
import { useContextMenu } from '../../composables/useContextMenu';
import { TopicType } from '../../services/useChatSDK/types';
import ContextMenu from './ContextMenu.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import GroupIcon from '../UI/GroupIcon.vue';

const route = useUrlWatcher();

const isAssistantRoute = computed(
  () => route.value?.type === RouteTypes.ASSISTANT
);
const isDialogsRoute = computed(() => route.value?.type === RouteTypes.DIALOGS);
const isGroupRoute = computed(() => route.value?.type === RouteTypes.GROUP);
const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const props = withDefaults(defineProps<IMobileListProps>(), {
  dataTestid: () => 'MobileList'
});
const { getTopicList, loading: loadingTopics } = useTopics();

const contactList = computed(() => {
  const topics = getTopicList();
  return [...topics];
});

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>(),
  isLoading: computed(() => loadingTopics.value)
});

const handleChapter = (route: RouteType) => {
  if (route === RouteTypes.AI) {
    navigateToAI();
  }
};

const emits = defineEmits<IMobileListEmits>();

const handleContactSelect = (): void => {};

const handleShowAccount = (topicType: TopicType) => {
  state.showAddAccount = true;

  if (topicType === TopicType.DM) {
    navigateToDialogsList();
  } else if (topicType === TopicType.Group) {
    navigateToGroupsList();
  }
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
