<template>
  <header
    class="chats-toolbar calls-page__panel-header"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <div class="chats-toolbar__headline calls-page__headline">
      <div class="calls-page__header-copy">
        <h4
          class="chats-toolbar__title calls-page__header-title"
          :data-testid="`${props.dataTestid}-Title`"
        >
          Звонки
        </h4>
      </div>

      <Button
        class="calls-page__meeting-button"
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-MeetingButton`"
        @click="event => openActivePopover('meetingMenu', event as MouseEvent)"
      >
        <CallAddIcon :data-testid="`${props.dataTestid}-MeetingButtonIcon`" />
      </Button>

      <Teleport to="body">
        <ContextMenu
          :visible="!!isOpen['meetingMenu']"
          :position="position"
          :data-testid="`${props.dataTestid}-MeetingContextMenu`"
          class="chats-toolbar__context-menu calls-page__context-menu"
          @unmount-close="closeActivePopover('meetingMenu')"
          @click="closeActivePopover('meetingMenu')"
        >
          <Button
            class="calls-page__context-action"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.small"
            :data-testid="`${props.dataTestid}-CreateMeetingButton`"
            @click="handleCreateMeeting"
          >
            <AddIcon />
            Создать встречу
          </Button>

          <Button
            class="calls-page__context-action"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.small"
            :data-testid="`${props.dataTestid}-CreateMeetingLinkButton`"
            @click="handleCreateMeetingAndCopyLink"
          >
            <LinkIcon />
            Новая ссылка на встречу
          </Button>
        </ContextMenu>
      </Teleport>
    </div>

    <Line :data-testid="`${props.dataTestid}-Line`" />
  </header>
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, MessageTypeEnum, SizesEnum } from '@pksep/yui';
import Line from '../UI/Line.vue';
import LinkIcon from '../UI/LinkIcon.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import AddIcon from './AddIcon.vue';
import CallAddIcon from './CallAddIcon.vue';
import { useContextMenu } from '../../composables/useContextMenu';
import {
  showErrorNotification,
  showNotification
} from '../../composables/useNotifications';
import {
  isCallActive,
  isModalVisible as isCallModalVisible
} from '../../services/useCallState';

const props = withDefaults(
  defineProps<{
    totalCount?: number;
    dataTestid?: string;
  }>(),
  {
    totalCount: 0,
    dataTestid: 'CallsHeader'
  }
);

const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const showCallModal = (): void => {
  isCallModalVisible.value = true;
};

const copyInviteGroupCallLink = async () => {
  const { copyInviteGroupCallLink } = await import('../../services/useCalls');

  return copyInviteGroupCallLink();
};

const createMeetingInviteLink = async () => {
  const { createMeetingInviteLink } = await import('../../services/useCalls');

  return createMeetingInviteLink();
};

const ensureMeetingCallReady = async (): Promise<boolean> => {
  if (isCallActive.value) {
    showCallModal();
    return true;
  }

  try {
    const { startStandaloneMeetingCall } = await import(
      '../../services/useLiveKit'
    );

    await startStandaloneMeetingCall();
    return isCallActive.value;
  } catch (error) {
    console.warn('Failed to start standalone meeting call', error);
    showErrorNotification('Не удалось создать встречу.');
    return false;
  }
};

const handleCreateMeeting = async () => {
  closeActivePopover('meetingMenu');
  await ensureMeetingCallReady();
};

const handleCreateMeetingAndCopyLink = async () => {
  closeActivePopover('meetingMenu');
  const isCopied = isCallActive.value
    ? await copyInviteGroupCallLink()
    : await createMeetingInviteLink();

  if (!isCopied) {
    showErrorNotification('Не удалось скопировать ссылку на встречу.');
    return;
  }

  showNotification({
    title: 'Скопировано',
    description: 'Ссылка на встречу скопирована',
    type: MessageTypeEnum.success
  });
};
</script>
