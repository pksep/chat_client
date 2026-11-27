<template>
  <div
    ref="element"
    popover="manual"
    :id="String(notification.key)"
    class="push-notification-yui-kit app-notification"
    :class="`push-notification-yui-kit_${notification.type}`"
    :role="notification.type === MessageTypeEnum.error ? 'alert' : 'status'"
    :aria-busy="notification.busy || undefined"
    :data-testid="dataTestid"
  >
    <span
      v-if="notification.busy"
      class="app-notification__spinner"
      aria-hidden="true"
    />
    <Icon
      v-else
      :name="icon"
      class="app-notification__icon"
      aria-hidden="true"
    />
    <span
      class="app-notification__text"
      :data-testid="`${dataTestid}-Notification-Description`"
      >{{ text }}</span
    >
    <button
      type="button"
      class="notification-yui-kit__exit app-notification__close"
      aria-label="Закрыть уведомление"
      :data-testid="`${dataTestid}-Notification-Button`"
      @click="$emit('close')"
    >
      <Icon :name="IconNameEnum.crossSmall" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Icon, IconNameEnum, MessageTypeEnum } from '@pksep/yui';
import type { INotificationItem } from '../../composables/useNotifications';

const props = withDefaults(
  defineProps<{ notification: INotificationItem; dataTestid?: string }>(),
  { dataTestid: 'Notification' }
);
defineEmits<{ close: [] }>();
const element = ref<HTMLElement | null>(null);
const text = computed(() => {
  const { title, description } = props.notification;
  return !title ||
    !description ||
    ['Ошибка', 'Успешно', 'Уведомление', 'Предупреждение'].includes(title)
    ? description || title
    : `${title}. ${description}`;
});
const icon = computed(
  () =>
    ({
      [MessageTypeEnum.success]: IconNameEnum.checkCircle,
      [MessageTypeEnum.warning]: IconNameEnum.alertTriangle,
      [MessageTypeEnum.error]: IconNameEnum.exitCircle,
      [MessageTypeEnum.info]: IconNameEnum.info
    })[props.notification.type]
);
const showPopover = () => {
  if (element.value?.isConnected && !element.value.matches(':popover-open'))
    element.value.showPopover();
};
defineExpose({ showPopover, element });
onMounted(showPopover);
</script>

<style scoped>
.app-notification {
  --notification-color: var(--action-primary-bg);
  box-sizing: border-box;
  width: min(320px, calc(100vw - 32px));
  min-height: 48px;
  padding: 10px 10px 10px 15px;
  border: 2px solid var(--notification-color);
  border-radius: 5px;
  background: var(--surface-overlay);
  color: var(--text-primary);
  box-shadow: 0 4px 9.8px rgb(0 0 0 / 5%);
  outline: 0;
  pointer-events: auto;
}
.app-notification:popover-open {
  display: grid;
  grid-template-columns: 29px minmax(0, 1fr) 16px;
  gap: 5px;
  align-items: center;
}
.push-notification-yui-kit_success {
  --notification-color: var(--status-success);
}
.push-notification-yui-kit_warning {
  --notification-color: var(--status-warning);
}
.push-notification-yui-kit_error {
  --notification-color: var(--status-error);
}
.app-notification__icon {
  width: 24px;
  height: 24px;
  font-size: 24px;
  color: var(--notification-color);
}
.app-notification__text {
  min-width: 0;
  font-size: 14px;
  font-weight: 400;
  line-height: 20px;
  overflow-wrap: anywhere;
  user-select: text;
}
.app-notification__close {
  display: grid;
  place-items: center;
  padding: 0;
  width: 16px;
  height: 24px;
  min-height: 0;
  border: 0;
  background: transparent;
  color: var(--icon-secondary);
  cursor: pointer;
}
.app-notification__close :deep(svg) {
  width: 16px;
  height: 16px;
}
.app-notification__close:focus-visible {
  outline: 2px solid var(--action-primary-bg);
  outline-offset: 2px;
  border-radius: 2px;
}
.app-notification__spinner {
  box-sizing: border-box;
  width: 22px;
  height: 22px;
  border: 2px solid var(--notification-color);
  border-right-color: transparent;
  border-radius: 50%;
  animation: notification-spin 800ms linear infinite;
}
@keyframes notification-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-notification__spinner {
    animation: none;
  }
}
</style>
