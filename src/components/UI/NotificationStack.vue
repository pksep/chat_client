<template>
  <Teleport :to="target">
    <PushNotification
      v-for="(notification, index) in state.items"
      :key="notification.key"
      ref="notificationRefs"
      class="app-notification-stack__item"
      :style="getNotificationStyle(index)"
      :title="notification.title"
      :push-key="notification.key"
      :description="notification.description"
      :type="notification.type"
      :data-testid="props.dataTestid"
      role="alert"
      @click="handleNotificationClick($event, notification.key)"
      @close="closeNotification(notification.key)"
    />
  </Teleport>
</template>

<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch
} from 'vue';
import { PushNotification } from '@pksep/yui';
import { useNotifications } from '../../composables/useNotifications';

const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'Notification'
});
const { state, closeNotification } = useNotifications();
const target = shallowRef<HTMLElement | string>('body');
const notificationRefs = ref<{ showPopover: () => void }[]>([]);
let dialogs: HTMLDialogElement[] = [];
let observer: MutationObserver | undefined;

const handleNotificationClick = (event: MouseEvent, key: number) => {
  // Кнопка YUI скрывает native popover, но не всегда отправляет close.
  if (
    event.target instanceof Element &&
    event.target.closest('.notification-yui-kit__exit')
  )
    closeNotification(key);
};

const trackDialog = (dialog: HTMLDialogElement) => {
  if (dialog.matches(':modal') && !dialogs.includes(dialog))
    dialogs.push(dialog);
};

onMounted(() => {
  document
    .querySelectorAll<HTMLDialogElement>('dialog:modal')
    .forEach(trackDialog);
  target.value = dialogs.at(-1) || 'body';
  // Внешние popover видны, но остаются inert при открытом native dialog.
  observer = new MutationObserver(records => {
    for (const record of records) {
      if (
        record.type === 'attributes' &&
        record.target instanceof HTMLDialogElement
      ) {
        dialogs = dialogs.filter(dialog => dialog !== record.target);
        trackDialog(record.target);
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node instanceof HTMLDialogElement) trackDialog(node);
        node
          .querySelectorAll<HTMLDialogElement>('dialog:modal')
          .forEach(trackDialog);
      }
    }
    dialogs = dialogs.filter(
      dialog => dialog.isConnected && dialog.matches(':modal')
    );
    target.value = dialogs.at(-1) || 'body';
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['open']
  });
});

watch(
  [target, () => state.items.length],
  async () => {
    await nextTick();
    notificationRefs.value.forEach(notification => notification.showPopover());
  },
  { flush: 'post' }
);

onBeforeUnmount(() => observer?.disconnect());

const getNotificationStyle = (index: number) => ({
  position: 'fixed',
  top: `${16 + index * 88}px`,
  right: '16px',
  left: 'auto',
  bottom: 'auto',
  margin: '0',
  zIndex: `${3000 - index}`
});
</script>

<style scoped>
.app-notification-stack__item {
  width: min(305px, calc(100vw - 32px));
  min-height: 77px;
  box-sizing: border-box;
  box-shadow: 0 4px 9.8px rgb(0 0 0 / 5%);
  pointer-events: auto;
}

.app-notification-stack__item.push-notification-yui-kit_info {
  --text-brand: var(--action-primary-bg);
}

.app-notification-stack__item :deep(.notification-yui-kit) {
  box-shadow: none;
}
</style>
