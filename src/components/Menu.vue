<template>
  <aside
    :class="menuClasses"
    :data-testid="`${props.dataTestid}-Menu-Container`"
  >
    <Loading
      v-if="state.isLoading"
      message="Загрузка меню..."
      :dataTestid="`${props.dataTestid}-Menu-Loading`"
    />
    <div
      v-else
      class="menu__start"
      :data-testid="`${props.dataTestid}-Menu-StartContainer`"
    >
      <div
        class="menu__profile"
        :data-testid="`${props.dataTestid}-Menu-ProfileContainer`"
      >
        <UserProfile
          v-bind="props.user"
          class="menu__user-profile"
          :data-testid="`${props.dataTestid}-Menu-UserProfile`"
          v-show="!isCollapse"
        />
        <Avatar
          v-if="isCollapse"
          :initials="props.user?.nickname"
          :url="props.user?.avatarUrl"
          :alt="props.user?.avatarAlt"
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
        @click="unmountContactClick('ai')"
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
      <template v-for="(item, index) in listChannels" :key="index">
        <template v-if="isCollapse && item.items.length !== 0">
          <Line :data-testid="`${props.dataTestid}-Menu-Line${index + 1}`" />
        </template>
        <details
          class="menu__user-details"
          v-if="!isCollapse"
          open
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
              {{ item.title }}
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
          <ContactList
            class="menu__contact-list"
            :contacts="item.items"
            @unmount-contact="unmountContactClick"
            :selected-contact-id="state.selectedContactId"
            :data-testid="`${props.dataTestid}-Menu-ContactList${index + 1}`"
          />
        </details>
        <template v-if="isCollapse">
          <ul
            class="menu__user"
            :data-testid="`${props.dataTestid}-Menu-CollapsedUser${index + 1}`"
          >
            <template v-for="(user, index) in item.items" :key="index">
              <li
                :class="[
                  'menu-user__item',
                  {
                    'menu-user__item--active':
                      user.id === state.selectedContactId
                  }
                ]"
                :data-testid="`${props.dataTestid}-Menu-CollapsedAvatar${index + 1}`"
                @click.stop="unmountContactClick(user)"
              >
                <Avatar
                  :url="user.avatarUrl"
                  :initials="user.nickname"
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
import { computed, onMounted, reactive, watch } from 'vue';
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
import ContactList from './ContactList/ContactList.vue';
import Loading from './Loading.vue';
import type {
  IContactProps,
  IMenuEmits,
  IMenuProps
} from './interfaces/interfaces';
import {
  fetchConversationList,
  getConversationList,
  onSDKReady
} from '../services/useConversions';
import { getGroupList } from '../services/useGroup';
import { markAsRead } from '../services/useOpenIM';
import Triangle from './Triangle.vue';
import { usePwaInstall } from '../composables/usePwaInstall';
import { navigateToAI } from '../composables/useUrlRouting';

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: () => 'Menu'
});

const { canInstall, handleInstall, isInstalled } = usePwaInstall();

const state = reactive({
  chapter: '',
  selectedContactId: null,
  isLoading: true
});

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

watch(
  () => props.chapter,
  () => {
    if (props.chapter !== state.chapter) {
      state.chapter = props.chapter;
    }
  }
);

const unmountContactClick = (contact: IContactProps | string): void => {
  state.selectedContactId = typeof contact === 'string' ? contact : contact.id;
  if (contact === 'ai') {
    state.chapter = 'ai';
    navigateToAI();
    emits('unmount-chapter', 'ai');
    return;
  }

  if (typeof contact === 'string') {
    const foundContact = getConversationList().find(c => c.id === contact);
    if (foundContact) {
      state.chapter = foundContact.nickname;

      if (foundContact.groupId) {
        markAsRead(foundContact.id).catch(error => {
          console.warn('Failed to mark messages as read:', error);
        });

        emits('unmount-chapter', {
          nickname: foundContact.nickname,
          contact: foundContact
        });
      }
    }
  } else {
    state.chapter = contact.nickname;
    if (contact.id) {
      markAsRead(contact.id).catch(error => {
        console.warn('Failed to mark messages as read:', error);
      });
    }

    emits('unmount-chapter', {
      nickname: contact.nickname,
      contact
    });
  }
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

const listChannels = computed(() => [
  {
    title: 'Каналы',
    onClickPlusButton: handleNewGroupModal,
    items: getGroupList()
  },
  {
    title: 'Личные сообщения',
    onClickPlusButton: handleNewContactModal,
    items: getConversationList()
  }
]);

onMounted(() => {
  onSDKReady(() => {
    fetchConversationList().finally(() => {
      state.isLoading = false;
    });
  });
});
</script>
