<template>
  <div class="message-status-icons">
    <Icon
      v-if="props.isRead"
      :name="IconNameEnum.read"
      :data-testid="`${dataTestid}-ReadIcon`"
    />
    <template v-else-if="props.messageStatus">
      <Icon
        v-if="props.messageStatus === MessageStatus.Delivery"
        :name="IconNameEnum.delivered"
        :data-testid="`${dataTestid}-DeliveredIcon`"
      />
      <Icon
        v-else-if="
          props.messageStatus === MessageStatus.Wait ||
          props.messageStatus === MessageStatus.NotDelivered
        "
        :name="IconNameEnum.notDelivered"
        :data-testid="`${dataTestid}-SendingIcon`"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { Icon, IconNameEnum } from '@pksep/yui';
import type { IMessageStatusIconsProps } from './interface/interface';
import { MessageStatus } from '../../services/useChatSDK/types';

const props = withDefaults(defineProps<IMessageStatusIconsProps>(), {
  isRead: false,
  isMeSender: false,
  dataTestid: () => 'MessageStatusIcons'
});
</script>
