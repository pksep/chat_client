<template>
  <div class="message-status-icons">
    <Icon
      v-if="isRead"
      :name="IconNameEnum.read"
      :data-testid="`${dataTestid}-ReadIcon`"
    />
    <template v-else-if="messageStatus !== undefined">
      <Icon
        v-if="messageStatus === 2"
        :name="IconNameEnum.delivered"
        :data-testid="`${dataTestid}-DeliveredIcon`"
      />
      <Icon
        v-else-if="messageStatus === 1"
        :name="IconNameEnum.notDelivered"
        :data-testid="`${dataTestid}-SendingIcon`"
      />
      <!--
      <Icon
        v-else-if="messageStatus === 3"
        :name="IconNameEnum.failed"
        :data-testid="`${dataTestid}-FailedIcon`"
      />
      -->
    </template>
  </div>
</template>

<script setup lang="ts">
import { Icon, IconNameEnum } from '@pksep/yui';

interface Props {
  isRead?: boolean;
  messageStatus?: number;
  dataTestid?: string;
}

withDefaults(defineProps<Props>(), {
  isRead: false,
  messageStatus: undefined,
  dataTestid: () => 'MessageStatusIcons'
});
</script>
