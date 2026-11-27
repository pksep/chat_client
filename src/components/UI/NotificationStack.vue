<template>
  <Teleport :to="target">
    <AppNotification
      v-for="(notification, index) in state.items"
      :key="notification.key"
      ref="notificationRefs"
      class="app-notification-stack__item"
      :style="getNotificationStyle(index)"
      :notification="notification"
      :data-testid="props.dataTestid"
      @pointerenter="pauseNotificationTimeout(notification.key)"
      @pointerleave="resumeNotificationTimeout(notification.key)"
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
import AppNotification from './AppNotification.vue';
import { useNotifications } from '../../composables/useNotifications';

const props = withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'Notification'
});
const {
  state,
  closeNotification,
  pauseNotificationTimeout,
  resumeNotificationTimeout
} = useNotifications();
const target = shallowRef<HTMLElement | string>('body');
const notificationRefs = ref<
  { showPopover: () => void; element: HTMLElement | null }[]
>([]);
const heights = ref<number[]>([]);
let resizeObserver: ResizeObserver | undefined;
let dialogs: HTMLDialogElement[] = [];
let observer: MutationObserver | undefined;

const trackDialog = (dialog: HTMLDialogElement) => {
  if (dialog.matches(':modal') && !dialogs.includes(dialog))
    dialogs.push(dialog);
};

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    heights.value = notificationRefs.value.map(
      item => item.element?.offsetHeight || 48
    );
  });
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
  [target, () => state.items.map(item => item.key).join(',')],
  async () => {
    await nextTick();
    notificationRefs.value.forEach(notification => notification.showPopover());
    resizeObserver?.disconnect();
    notificationRefs.value.forEach(notification => {
      if (notification.element) resizeObserver?.observe(notification.element);
    });
    heights.value = notificationRefs.value.map(
      item => item.element?.offsetHeight || 48
    );
  },
  { flush: 'post', immediate: true }
);

onBeforeUnmount(() => {
  observer?.disconnect();
  resizeObserver?.disconnect();
});

const getNotificationStyle = (index: number) => ({
  position: 'fixed',
  top: `calc(var(--notification-viewport-top, 0px) + ${16 + heights.value.slice(0, index).reduce((sum, height) => sum + height + 8, 0)}px)`,
  right: '16px',
  left: 'auto',
  bottom: 'auto',
  margin: '0',
  zIndex: `${3000 - index}`
});
</script>
