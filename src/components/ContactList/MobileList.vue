<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
  >
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
      :disabled="isAssistantRoute"
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
import { reactive, computed } from 'vue';
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
  SizesEnum
} from '@pksep/yui';
import NewChatMobileModal from '../NewChat/NewChatMobileModal.vue';
import TopicList from './TopicList.vue';
import { useTopics } from '../../composables/useTopics';
import { useUrlWatcher } from '../../composables/navigation';
import {
  navigateToDialogsList,
  navigateToGroupsList,
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
const isGroupRoute = computed(() => route.value?.type === RouteTypes.GROUP);
const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const props = withDefaults(defineProps<IMobileListProps>(), {
  dataTestid: () => 'MobileList'
});
const { getTopicList } = useTopics();

const contactList = computed(() => {
  const topics = getTopicList();
  return [...topics];
});

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>()
});

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
