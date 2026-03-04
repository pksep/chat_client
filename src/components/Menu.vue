<template>
  <aside
    :class="menuClasses"
    :data-testid="`${props.dataTestid}-Menu-Container`"
  >
    <div
      class="menu__start"
      :data-testid="`${props.dataTestid}-Menu-StartContainer`"
    >
      <div
        class="menu__profile"
        :data-testid="`${props.dataTestid}-Menu-ProfileContainer`"
      >
        <UserProfile
          v-if="authUser"
          :user="authUser"
          class="menu__user-profile"
          :data-testid="`${props.dataTestid}-Menu-UserProfile`"
          v-show="!isCollapse"
        />
        <Avatar
          v-if="isCollapse && authUser"
          v-bind="authUser"
          :url="`${config.CHAT_PATH_TO_FILE_CDN}/${authUser?.avatarUrl}`"
          is-icon
          :data-testid="`${props.dataTestid}-Menu-ProfileAvatar`"
        />
        <Icon
          :name="
            isCollapse ? IconNameEnum.chevronRight : IconNameEnum.chevronLeft
          "
          class="menu__user-profile__collapse"
          @click="handleCollapse"
          :data-testid="`${props.dataTestid}-Menu-CollapseIcon`"
        />
      </div>
      <Line :data-testid="`${props.dataTestid}-Menu-Line`" />

      <div class="menu__user-details-summary">
        <h4
          v-if="!isCollapse"
          class="menu__user-details-summary--title"
          :data-testid="`${props.dataTestid}-Menu-DetailsTitle`"
        >
          Чаты
        </h4>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.little"
          :data-testid="`${props.dataTestid}-Menu-PlusButton`"
          @click="evt => openActivePopover('plusMenu', evt as MouseEvent)"
        >
          <Icon
            :name="IconNameEnum.plus"
            :data-testid="`${props.dataTestid}-Menu-PlusIcon`"
          />
        </Button>

        <ContextMenu
          :visible="!!isOpen['plusMenu']"
          :position="position"
          @unmount-close="closeActivePopover('plusMenu')"
          @click="closeActivePopover('plusMenu')"
          :data-testid="`${dataTestid}-MessageBubble-ContextMenu`"
        >
          <Button
            @click="handleNewContactModal"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.small"
            :data-testid="`${dataTestid}-MessageBubble-ReplyButton`"
          >
            <MessageIcon /> Создать диалог
          </Button>
          <Button
            @click="handleNewGroupModal"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.small"
            :data-testid="`${dataTestid}-MessageBubble-EditButton`"
          >
            <GroupIcon /> Создать группу
          </Button>
        </ContextMenu>
      </div>

      <TopicList
        class="menu__contact-list"
        :topics="topicGroups"
        @unmount-topic="unmountTopicClick"
        :selected-topic-id="state.selectedContactId"
        :data-testid="`${props.dataTestid}-Menu-ContactList`"
      />
    </div>
    <Button
      v-if="canInstall && !isInstalled"
      class="menu__button-install-prompt"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      @click="handleInstall"
      :data-testid="`${props.dataTestid}-Menu-InstallButton`"
    >
      <Icon
        :name="IconNameEnum.uploadCloud"
        :data-testid="`${props.dataTestid}-Menu-InstallIcon`"
      />
      <template v-if="!isCollapse"> Загрузить на устройство </template>
    </Button>
  </aside>
</template>

<script lang="ts" setup>
import { computed, reactive } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_XL } from '../utils/constants';
import Line from './UI/Line.vue';
import {
  Icon,
  Button,
  Avatar,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import UserProfile from './UserProfile/UserProfile.vue';
import type { ITopic, IMenuEmits, IMenuProps } from './interfaces/interfaces';
import { usePwaInstall } from '../composables/usePwaInstall';
import {
  navigateToGroup,
  navigateToDialogs,
  useUrlWatcher
} from '../composables/navigation';
import { useTopics } from '../composables/useTopics';
import { getAuthUser } from '../composables/useAuth';
import TopicList from './ContactList/TopicList.vue';
import { useContextMenu } from '../composables/useContextMenu';
import ContextMenu from './ContactList/ContextMenu.vue';
import MessageIcon from './UI/MessageIcon.vue';
import GroupIcon from './UI/GroupIcon.vue';
import { getConfig } from '../services/useConfig';

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: 'Menu'
});

const { getTopicList } = useTopics();

const route = useUrlWatcher();

const config = getConfig();

const { canInstall, handleInstall, isInstalled } = usePwaInstall();

const getInitialDetailsOpen = () => {
  const stored = localStorage.getItem('menu-details-open');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length === 2) {
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to parse menu-details-open from localStorage', e);
    }
  }
  return [true, true];
};

const topicGroups = computed(() => getTopicList());

const state = reactive({
  selectedContactId: computed(() => route.value?.id),
  isLoading: true,
  detailsOpen: getInitialDetailsOpen()
});

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const authUser = computed(() => getAuthUser());

const emits = defineEmits<IMenuEmits>();

const { state: isCollapse, toggle } = useResizeState({
  breakpoint: MAX_W_XL,
  storageKey: 'menu-collapse',
  onStateChange: val => {
    emits('unmount-collapse', val);
  }
});

const handleCollapse = (): void => {
  toggle();
};

const unmountTopicClick = (topic: ITopic): void => {
  if (topic.type === 'GROUP') {
    navigateToGroup(topic.id);
  } else if (topic.type === 'DM') {
    navigateToDialogs(topic.id);
  }
};

const menuClasses = computed(() => [
  'menu',
  { 'menu--collapse': isCollapse.value },
  props.class
]);

const handleNewGroupModal = () => {
  emits('unmount-new-group', { isChapterOpen: true });
};

const handleNewContactModal = () => {
  emits('unmount-new-contact', { isChapterOpen: true });
};
</script>
