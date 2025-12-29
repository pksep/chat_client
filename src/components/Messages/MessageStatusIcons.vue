<template>
  <div class="message-status-icons">
    <Icon
      v-if="props.isRead"
      :name="IconNameEnum.read"
      :data-testid="`${dataTestid}-ReadIcon`"
    />
    <template v-else-if="props.messageStatus !== undefined">
      <Icon
        v-if="props.messageStatus === 2"
        :name="IconNameEnum.delivered"
        :data-testid="`${dataTestid}-DeliveredIcon`"
      />
      <Icon
        v-else-if="props.messageStatus === 1"
        :name="IconNameEnum.notDelivered"
        :data-testid="`${dataTestid}-SendingIcon`"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { Icon, IconNameEnum } from '@pksep/yui';
import type { IMessageStatusIconsProps } from './interface/interface';

const props = withDefaults(defineProps<IMessageStatusIconsProps>(), {
  isRead: false,
  isMeSender: false,
  dataTestid: () => 'MessageStatusIcons'
});
</script>
