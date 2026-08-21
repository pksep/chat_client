<template>
  <aside
    v-if="!!currentGroup"
    v-show="props.open"
    :class="menuInfoClasses"
    :data-testid="`${props.dataTestid}-MenuInfo-Container`"
  >
    <header
      class="menu-info__header"
      :data-testid="`${props.dataTestid}-MenuInfo-Header`"
    >
      <div class="menu-info__header-title">
        <h4 :data-testid="`${props.dataTestid}-MenuInfo-Title`">
          Информация о группе
        </h4>
        <span :data-testid="`${props.dataTestid}-MenuInfo-MembersCount`">
          {{ membersLabel }}
        </span>
      </div>
      <Button
        class="menu-info__close-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-MenuInfo-CloseButton`"
        @click="handleCloseMenu"
      >
        <Icon
          :name="IconNameEnum.crossLarge"
          class="menu-info__close-icon"
          :data-testid="`${props.dataTestid}-MenuInfo-CloseIcon`"
        />
      </Button>
    </header>

    <section
      class="menu-info__content"
      :data-testid="`${props.dataTestid}-MenuInfo-Content`"
    >
      <section
        class="menu-info__info-section"
        :data-testid="`${props.dataTestid}-MenuInfo-InfoSection`"
      >
        <slot name="information-menu">
          <InformationMenu
            :is-admin="currentGroup.isAdmin"
            :model-value="state.information"
            :data-testid="`${props.dataTestid}-MenuInfo-InformationMenu`"
            @update:model-value="handleUpdateInformation"
            @unmount-open-chat="handleCloseMenu"
          />
        </slot>
      </section>

      <div
        class="menu-info__tabs"
        role="tablist"
        :data-testid="`${props.dataTestid}-MenuInfo-Tabs`"
      >
        <button
          v-for="tab in menuInfoTabs"
          :key="tab.value"
          type="button"
          role="tab"
          class="menu-info__tab"
          :class="{ 'menu-info__tab--active': activeInfoTab === tab.value }"
          :aria-selected="activeInfoTab === tab.value"
          :data-testid="`${props.dataTestid}-MenuInfo-Tab-${tab.value}`"
          @click="setActiveInfoTab(tab.value)"
        >
          {{ tab.label }}
        </button>
      </div>

      <ContactListInModal
        v-if="activeInfoTab === 'participants'"
        :show-add-button="currentGroup.isAdmin"
        :contacts="currentGroup.members"
        :filtered-contacts="filteredMembers"
        :excluded-contact-ids="excludedContactIds"
        class="menu-info__participants"
        :data-testid="`${props.dataTestid}-MenuInfo-ContactListInModal`"
        @unmount-click-add-button="handleContactClick"
      />

      <ProfileAttachmentsPanel
        v-else
        :topic-id="attachmentsTopicId"
        :active-tab="attachmentsTab"
        :show-tabs="false"
        class="menu-info__attachments"
        :data-testid="`${props.dataTestid}-MenuInfo-Attachments`"
        @show-in-chat="handleCloseMenu"
      />
    </section>
  </aside>

  <NewContactModal
    :open="state.openAddUser"
    :isAddOne="false"
    :contacts="filteredMembers"
    :excluded-contact-ids="excludedContactIds"
    title="Добавить контакт"
    @unmount-new-contact="handleNewContactAdded"
    @unmount-close="handleCloseAddUserModal"
  />
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import ContactListInModal from './ContactList/ContactListInModal.vue';
import InformationMenu from './InformationMenu.vue';
import type { IMenuRightProps, ITopic, IUser } from './interfaces/interfaces';
import { useMenuInfo } from '../composables/useMenuInfo';
import NewContactModal from './NewChat/NewContactModal.vue';
import ProfileAttachmentsPanel from './ProfileAttachmentsPanel.vue';
import { useUrlWatcher } from '../composables/navigation';
import { currentGroup, useGroup } from '../composables/useGroup';

type MenuInfoTab = 'participants' | 'media' | 'files';
type ProfileAttachmentsTab = 'media' | 'files';

const props = withDefaults(defineProps<IMenuRightProps>(), {
  open: false,
  dataTestid: () => 'MenuInfo'
});

const {
  state,
  initializeMenuInfo,
  handleContactClick,
  handleUpdateInformation,
  handleCloseAddUserModal,
  filteredMembers
} = useMenuInfo();

const { addGroupMembers } = useGroup();

const topic = useUrlWatcher();
const activeInfoTab = ref<MenuInfoTab>('participants');
const menuInfoTabs: Array<{ label: string; value: MenuInfoTab }> = [
  { label: 'Участники', value: 'participants' },
  { label: 'Медиа', value: 'media' },
  { label: 'Файлы', value: 'files' }
];

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open },
  props.class
]);

const attachmentsTopicId = computed(
  () => state.information?.topicId || topic.value.id || null
);

const attachmentsTab = computed<ProfileAttachmentsTab>(() =>
  activeInfoTab.value === 'files' ? 'files' : 'media'
);

const setActiveInfoTab = (tab: MenuInfoTab): void => {
  activeInfoTab.value = tab;
};

const excludedContactIds = computed(() => {
  const ids = new Set<string | number>();
  currentGroup.value?.members?.forEach(contact => {
    if (contact?.id) {
      ids.add(contact.id);
    }
  });
  return ids;
});

const getParticipantForm = (count = 0): string => {
  const lastTwoDigits = Math.abs(count) % 100;
  const lastDigit = Math.abs(count) % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'участников';
  }

  if (lastDigit === 1) {
    return 'участник';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'участника';
  }

  return 'участников';
};

const membersLabel = computed(() => {
  const count = currentGroup.value?.members?.length || 0;
  return `${count} ${getParticipantForm(count)}`;
});

const emits = defineEmits<{
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-new-group', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-contacts-update', contacts: IUser[]): void;
}>();

const handleCloseMenu = (): void => {
  emits('unmount-collapse', false);
};

const handleNewContactAdded = async (
  contact: IUser | ITopic[]
): Promise<void> => {
  if (Array.isArray(contact)) {
    if (contact.length > 0 && 'initials' in contact[0]) {
      const users = contact as unknown as IUser[];
      if (state.information?.groupId) {
        await addGroupMembers(state.information.groupId, users);
      }
    }
  } else if (state.information?.groupId) {
    const users = [contact as unknown as IUser];
    await addGroupMembers(state.information.groupId, users);
  }
};

watch(
  () => [props.open, topic.value.id],
  async () => {
    if (props.open === true) {
      activeInfoTab.value = 'participants';
      await initializeMenuInfo({
        ...props,
        isEnabled: true,
        topic: topic.value
      });
    }
  },
  { immediate: true }
);
</script>
