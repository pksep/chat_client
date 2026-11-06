<template>
  <div
    class="message-context-menu__details-list"
    :data-testid="props.dataTestid"
  >
    <div
      v-for="recipient in recipients"
      :key="recipient.userId"
      class="message-context-menu__details-item"
      :class="{
        'message-context-menu__details-item--interactive': canOpenUserInfo(
          recipient.user
        )
      }"
      :data-user-id="recipient.userId"
      :data-status="recipient.status"
      @click.stop="emit('selectUser', recipient.user)"
    >
      <CachedAvatar
        class="message-context-menu__details-avatar"
        :path="recipient.user?.avatarUrl || ''"
        :initials="recipient.name"
        :alt="recipient.name"
      />
      <div class="message-context-menu__details-meta">
        <div class="message-context-menu__details-name" :title="recipient.name">
          {{ recipient.name }}
        </div>
        <div
          class="message-context-menu__details-time"
          :title="recipient.label"
        >
          <span class="message-context-menu__details-date">{{
            recipient.dateLabel || recipient.label
          }}</span>
          <span
            v-if="recipient.timeLabel"
            class="message-context-menu__details-time-value"
            >{{ recipient.timeLabel }}</span
          >
        </div>
      </div>
      <MessageStatusIcons
        class="message-context-menu__details-status"
        :message-status="recipient.status"
        :data-testid="`${props.dataTestid}-User-${recipient.userId}`"
        :aria-label="recipient.label"
      />
    </div>
    <div v-if="!recipients.length" class="message-context-menu__details-empty">
      Нет других участников
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { IMessage, ITopic, IUser } from '../interfaces/interfaces';
import { getUserById } from '../../composables/useUsers';
import { useUserInfoModal } from '../../composables/useUserInfoModal';
import {
  getMessageReadReceipts,
  getMessageRecipients,
  getRecipientMessageStatus
} from '../../utils/message-delivery-status';
import { MessageStatus } from '../../services/useChatSDK/types';
import CachedAvatar from '../UI/CachedAvatar.vue';
import MessageStatusIcons from './MessageStatusIcons.vue';

const props = defineProps<{
  message: IMessage;
  topic?: ITopic;
  dataTestid: string;
}>();
const emit = defineEmits<{ selectUser: [user?: IUser] }>();
const { canOpenUserInfo } = useUserInfoModal();
const statusOrder = [
  MessageStatus.Read,
  MessageStatus.Delivery,
  MessageStatus.Sent
];
const labels = {
  [MessageStatus.Read]: 'Просмотрено',
  [MessageStatus.Delivery]: 'Доставлено',
  [MessageStatus.Sent]: 'Не доставлено'
};
const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
});
const timeFormat = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit'
});
const recipients = computed(() => {
  const reads = getMessageReadReceipts(props.message);
  return getMessageRecipients(props.message, props.topic)
    .map(userId => {
      const user =
        getUserById(userId) ||
        props.topic?.members?.find(member => member.id === userId) ||
        (props.topic?.user?.id === userId ? props.topic.user : undefined);
      const status = getRecipientMessageStatus(props.message, userId);
      const receipt = (
        status === MessageStatus.Read
          ? reads
          : props.message.deliveryState?.delivered
      )?.find(item => item.userId === userId);
      const timestamp = receipt?.createdAt
        ? new Date(receipt.createdAt).getTime()
        : 0;
      const date =
        Number.isFinite(timestamp) && timestamp
          ? new Date(timestamp)
          : undefined;
      return {
        userId,
        user,
        status,
        name: user?.initials || user?.nickname || 'Пользователь',
        label: labels[status as keyof typeof labels],
        timestamp: date ? timestamp : 0,
        dateLabel: date ? dateFormat.format(date) : '',
        timeLabel: date ? timeFormat.format(date) : ''
      };
    })
    .sort(
      (left, right) =>
        statusOrder.indexOf(left.status) - statusOrder.indexOf(right.status) ||
        left.timestamp - right.timestamp ||
        left.name.localeCompare(right.name, 'ru')
    );
});
</script>
