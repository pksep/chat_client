<template>
  <div
    v-if="channel"
    class="client-message-delivery"
    data-testid="ClientMessageDelivery"
  >
    <span
      >{{ channelLabel(channel)
      }}<template v-if="delivery"> · {{ status }}</template></span
    >
    <Button
      v-if="delivery?.state === 'failed'"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.little"
      :disabled="busy"
      @click.stop="retry(false)"
      >Повторить отправку</Button
    >
    <template v-if="delivery?.state === 'uncertain'">
      <span
        >Проверьте часть {{ (delivery.sending_part ?? 0) + 1 }} в исходной
        переписке: она могла быть отправлена.</span
      >
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :disabled="busy"
        @click.stop="confirm = !confirm"
        >Проверить повтор</Button
      >
      <template v-if="confirm"
        ><span>Повтор может создать дубль.</span
        ><Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.little"
          :disabled="busy"
          @click.stop="retry(true, true)"
          >Уже доставлена</Button
        ><Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.little"
          :disabled="busy"
          @click.stop="retry(true)"
          >Повторить часть</Button
        ></template
      >
    </template>
    <span v-if="error" role="alert">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { managerMessageChannel } from '../../utils/managerMessageChannel';
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';
import {
  managerRequest,
  useManagerInquiries
} from '../../composables/useManagerInquiries';
import {
  channelLabel,
  managerDeliveries,
  refreshManagerRoutes
} from '../../composables/useManagerRoutes';

const props = defineProps<{
  messageId: string;
  topicId: string;
  ex?: unknown;
}>();
const { byTopic } = useManagerInquiries();
const delivery = computed(() => managerDeliveries[props.messageId]);
const channel = computed(() => {
  if (!byTopic.value.has(props.topicId)) return '';
  return managerMessageChannel(props.ex);
});
const status = computed(
  () =>
    ({
      pending: 'Ожидает отправки',
      working: 'Отправляется',
      delivered: delivery.value?.confirmed_by_manager
        ? 'Доставку подтвердил менеджер'
        : 'Отправлено',
      failed: 'Не отправлено',
      uncertain: 'Отправка не подтверждена'
    })[delivery.value?.state || 'pending']
);
const busy = ref(false);
const confirm = ref(false);
const error = ref('');

async function retry(
  checkedOriginalChat: boolean,
  alreadyDelivered = false
): Promise<void> {
  const inquiry = byTopic.value.get(props.topicId);
  if (!inquiry || busy.value) return;
  busy.value = true;
  try {
    await managerRequest(
      `inquiries/${inquiry.id}/channel-deliveries/${alreadyDelivered ? 'confirm' : 'retry'}`,
      {
        messageId: props.messageId,
        checkedOriginalChat
      }
    );
    await refreshManagerRoutes(props.topicId, inquiry.id);
    confirm.value = false;
    error.value = '';
  } catch {
    error.value = 'Не удалось обновить отправку';
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.client-message-delivery {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-text-secondary, #757d8a);
  padding: 3px 8px;
  max-width: 100%;
}
</style>
