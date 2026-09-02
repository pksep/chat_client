<template>
  <div class="message-status-icons">
    <Icon
      v-if="props.isRead"
      :name="IconNameEnum.read"
      :data-testid="`${dataTestid}-ReadIcon`"
      color="var(--text-link)"
    />
    <template v-else-if="props.messageStatus">
      <Icon
        v-if="props.messageStatus === MessageStatus.Delivery"
        :name="IconNameEnum.read"
        :data-testid="`${dataTestid}-DeliveredIcon`"
      />
      <Icon
        v-if="props.messageStatus === MessageStatus.Wait"
        :name="IconNameEnum.notDelivered"
        :data-testid="`${dataTestid}-SendingIcon`"
      />
      <ErrorIcon
        v-else-if="props.messageStatus === MessageStatus.NotDelivered"
        :data-testid="`${dataTestid}-ErrorIcon`"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { Icon, IconNameEnum } from '@pksep/yui';
import type { IMessageStatusIconsProps } from './interface/interface';
import { MessageStatus } from '../../services/useChatSDK/types';
import ErrorIcon from '../UI/ErrorIcon.vue';

const props = withDefaults(defineProps<IMessageStatusIconsProps>(), {
  isRead: false,
  isMeSender: false,
  dataTestid: () => 'MessageStatusIcons'
});
</script>
