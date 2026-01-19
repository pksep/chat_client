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
          :user="state.authUser"
          class="menu__user-profile"
          :data-testid="`${props.dataTestid}-Menu-UserProfile`"
          v-show="!isCollapse"
        />
        <Avatar
          v-if="isCollapse"
          :initials="state.authUser?.initials"
          :url="state.authUser?.avatarUrl"
          :alt="state.authUser?.avatarUrl"
          is-icon
          :data-testid="`${props.dataTestid}-Menu-ProfileAvatar`"
        />
        <Button
          :size="SizesEnum.small"
          :type="ButtonTypeEnum.ghost"
          class="menu__user-profile-collapse"
          @click="handleCollapse"
          :data-testid="`${props.dataTestid}-Menu-CollapseButton`"
        >
          <Icon
            :name="IconNameEnum.sidebar"
            class="menu__user-profile-collapse-icon"
            :data-testid="`${props.dataTestid}-Menu-CollapseIcon`"
          />
        </Button>
      </div>
      <Line
        class="menu__user-line"
        :data-testid="`${props.dataTestid}-Menu-SeparatorLine`"
      />
      <div
        :class="aiChapterClasses"
        @click="unmountClickAI"
        :data-testid="`${props.dataTestid}-Menu-AIAssistantContainer`"
      >
        <AiIconWrapper
          :data-testid="`${props.dataTestid}-Menu-AIAssistantIcon`"
        />
        <h3
          class="menu__user-assistant-title"
          v-if="!isCollapse"
          :data-testid="`${props.dataTestid}-Menu-AIAssistantTitle`"
        >
          AI Ассистент
        </h3>
      </div>
      <template v-for="(item, index) in topicGroups" :key="index">
        <template v-if="isCollapse && item.items.length !== 0">
          <Line :data-testid="`${props.dataTestid}-Menu-Line${index + 1}`" />
        </template>
        <details
          class="menu__user-details"
          v-if="!isCollapse"
          :open="state.detailsOpen[index]"
          @toggle="handleToggle($event, index)"
          :data-testid="`${props.dataTestid}-Menu-Details${index + 1}`"
        >
          <summary
            class="menu__user-details-summary"
            :data-testid="`${props.dataTestid}-Menu-DetailsSummary${index + 1}`"
          >
            <h4
              class="menu__user-details-summary--title"
              :data-testid="`${props.dataTestid}-Menu-DetailsTitle${index + 1}`"
            >
              {{ item.type === 'GROUP' ? 'Каналы' : 'Личные сообщения' }}
              <Triangle class="menu__user-details-summary-triangle" />
            </h4>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.little"
              @click="item.onClickPlusButton"
              :data-testid="`${props.dataTestid}-Menu-PlusButton${index + 1}`"
            >
              <Icon
                :name="IconNameEnum.plus"
                :data-testid="`${props.dataTestid}-Menu-PlusIcon${index + 1}`"
              />
            </Button>
          </summary>
          <TopicList
            class="menu__contact-list"
            :topics="item.items"
            @unmount-topic="unmountTopicClick"
            :selected-topic-id="state.selectedContactId"
            :data-testid="`${props.dataTestid}-Menu-ContactList${index + 1}`"
          />
        </details>
        <template v-if="isCollapse">
          <ul
            class="menu__user"
            :data-testid="`${props.dataTestid}-Menu-CollapsedUser${index + 1}`"
          >
            <template v-for="(contact, index) in item.items" :key="index">
              <li
                :class="[
                  'menu-user__item',
                  {
                    'menu-user__item--active':
                      contact.id === state.selectedContactId
                  }
                ]"
                :data-testid="`${props.dataTestid}-Menu-CollapsedAvatar${index + 1}`"
                @click.stop="unmountTopicClick(contact)"
              >
                <Avatar
                  :url="contact.avatarUrl"
                  :initials="contact.name"
                  :data-testid="`${props.dataTestid}-Menu-UserAvatar${index + 1}`"
                />
              </li>
            </template>
          </ul>
        </template>
      </template>
    </div>
    <Button
      v-if="canInstall && !isInstalled && !state.isLoading"
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
import { computed, reactive, watch, onMounted } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_XL } from '../utils/constants';
import Line from './UI/Line.vue';
import AiIconWrapper from './UI/AiIconWrapper.vue';
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
import { getGroupList } from '../services/useGroup';
import { markAsRead } from '../services/useChat';
import Triangle from './Triangle.vue';
import { usePwaInstall } from '../composables/usePwaInstall';
import { navigateToAI } from '../composables/useUrlRouting';
import { getTopicList } from '../composables/useTopics';
import { getAuthUser } from '../composables/useAuth';
import TopicList from './ContactList/TopicList.vue';

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: () => 'Menu'
});

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

const state = reactive({
  chapter: '',
  selectedContactId: null,
  isLoading: true,
  authUser: computed(() => getAuthUser()),
  detailsOpen: getInitialDetailsOpen()
});

const emits = defineEmits<IMenuEmits>();

const { state: isCollapse, toggle } = useResizeState({
  breakpoint: MAX_W_XL,
  storageKey: 'menu-collapse',
  onStateChange: val => {
    emits('unmount-collapse', val);
  }
});

const handleToggle = (event: Event, index: number): void => {
  const target = event.target as HTMLDetailsElement;
  state.detailsOpen[index] = target.open;
  localStorage.setItem('menu-details-open', JSON.stringify(state.detailsOpen));
};

const handleCollapse = (): void => {
  toggle();
};

watch(
  () => props.chapter,
  () => {
    if (props.chapter !== state.chapter) {
      state.chapter = props.chapter;
    }
  }
);

const unmountClickAI = (): void => {
  state.selectedContactId = 'ai';
  state.chapter = 'ai';
  navigateToAI();
  emits('unmount-select-ai');
};

const unmountTopicClick = (topic: ITopic): void => {
  state.selectedContactId = typeof topic === 'string' ? topic : topic.id;
  state.chapter = topic.name;
  markAsRead(topic.id).catch(error => {
    console.warn('Failed to mark messages as read:', error);
  });

  emits('unmount-select-topic', topic);
};

const menuClasses = computed(() => [
  'menu',
  { 'menu--collapse': isCollapse.value },
  props.class
]);

const aiChapterClasses = computed(() => [
  'menu__user-assistant',
  {
    'menu__user-assistant--active': state.chapter === 'ai'
  }
]);

const handleNewGroupModal = () => {
  emits('unmount-new-group', { isChapterOpen: true });
};

const handleNewContactModal = () => {
  emits('unmount-new-contact', { isChapterOpen: true });
};

const topicGroups = computed(() => [
  {
    type: 'GROUP',
    onClickPlusButton: handleNewGroupModal,
    items: getGroupList()
  },
  {
    title: 'DM',
    onClickPlusButton: handleNewContactModal,
    items: getTopicList()
  }
]);
</script>
