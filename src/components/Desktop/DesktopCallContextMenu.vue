<template>
  <div
    v-if="context.contextMenuOpen.value"
    ref="menu"
    class="desktop-call-context-menu"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    role="menu"
    aria-label="Управление звонком"
    data-testid="DesktopCallContextMenu"
    @contextmenu.prevent.stop
    @keydown="handleKeys"
  >
    <button
      type="button"
      role="menuitem"
      @click="run(requestDesktopCallStatus)"
    >
      <InfoIcon />
      <span>Статус звонка</span>
    </button>
    <div class="desktop-call-context-menu__separator" />
    <button
      v-for="device in devices"
      :key="device.label"
      type="button"
      role="menuitem"
      :aria-label="device.actionLabel"
      :disabled="!canControl"
      @click="run(device.action)"
    >
      <component :is="device.icon" />
      <span>{{ device.label }}</span>
      <small
        :class="{ 'desktop-call-context-menu__enabled': device.enabled }"
        >{{ device.status }}</small
      >
    </button>
    <div class="desktop-call-context-menu__separator" />
    <button
      type="button"
      role="menuitem"
      @click="run(context.actions.toggleHandRaise)"
      :disabled="!canControl"
    >
      <HandRaiseIcon />
      <span>{{ state.isHandRaised ? 'Опустить руку' : 'Поднять руку' }}</span>
    </button>
    <div class="desktop-call-context-menu__reactions" aria-label="Реакции">
      <button
        v-for="reaction in reactions"
        :key="reaction.value"
        type="button"
        role="menuitem"
        :aria-label="reaction.label"
        :disabled="!canControl"
        @click="run(() => context.actions.sendCallReaction?.(reaction.value))"
      >
        {{ reaction.emoji }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useDesktopCallWindowContext } from './call-window-context';
import {
  isCalling,
  isIncoming,
  open as callOpen,
  state,
  type CallReaction
} from '../../services/useCallState';
import MicIcon from '../CallModal/UI/MicIcon.vue';
import MicDisableIcon from '../CallModal/UI/MicDisableIcon.vue';
import VideoIcon from '../CallModal/UI/VideoIcon.vue';
import VideoDisableIcon from '../CallModal/UI/VideoDisableIcon.vue';
import ScreenShareIcon from '../CallModal/UI/ScreenShareIcon.vue';
import HandRaiseIcon from '../CallModal/UI/HandRaiseIcon.vue';
import InfoIcon from '../CallModal/UI/GroupInfoIcon.vue';
import { requestDesktopCallStatus } from '../../services/desktop-call-status';

const context = useDesktopCallWindowContext()!;
const host = context.renderWindow;
const doc = host.document;
const menu = ref<HTMLElement>();
const canControl = computed(() => !isCalling.value && !isIncoming.value);
const position = ref({ x: 0, y: 0 });
const devices = computed(() => [
  {
    label: 'Микрофон',
    icon: state.isMicActive ? MicIcon : MicDisableIcon,
    enabled: state.isMicActive,
    status: state.isMicActive ? 'Включён' : 'Выключен',
    actionLabel: state.isMicActive ? 'Выключить микрофон' : 'Включить микрофон',
    action: context.actions.toggleMic
  },
  {
    label: 'Камера',
    icon: state.isVideoActive ? VideoIcon : VideoDisableIcon,
    enabled: state.isVideoActive,
    status: state.isVideoActive ? 'Включена' : 'Выключена',
    actionLabel: state.isVideoActive ? 'Выключить камеру' : 'Включить камеру',
    action: context.actions.toggleVideo
  },
  {
    label: 'Демонстрация экрана',
    icon: ScreenShareIcon,
    enabled: state.isScreenSharingActive,
    status: state.isScreenSharingActive ? 'Включена' : 'Выключена',
    actionLabel: state.isScreenSharingActive
      ? 'Остановить демонстрацию'
      : 'Начать демонстрацию',
    action: context.actions.toggleScreenShare
  }
]);
const reactions: Array<{ value: CallReaction; emoji: string; label: string }> =
  [
    { value: 'heart', emoji: '❤️', label: 'Сердце' },
    { value: 'thumbs-up', emoji: '👍', label: 'Нравится' },
    { value: 'thumbs-down', emoji: '👎', label: 'Не нравится' },
    { value: 'joy', emoji: '😂', label: 'Смех' },
    { value: 'sob', emoji: '😭', label: 'Слёзы' }
  ];
const close = () => {
  context.contextMenuOpen.value = false;
};
const open = async (event: MouseEvent) => {
  if (!callOpen.value || doc.querySelector('dialog:modal')) return;
  event.preventDefault();
  position.value = { x: event.clientX, y: event.clientY };
  context.contextMenuOpen.value = true;
  await nextTick();
  if (!menu.value) return;
  const bounds = menu.value.getBoundingClientRect();
  position.value = {
    x: Math.max(8, Math.min(event.clientX, host.innerWidth - bounds.width - 8)),
    y: Math.max(
      8,
      Math.min(event.clientY, host.innerHeight - bounds.height - 8)
    )
  };
  menu.value.querySelector('button')?.focus();
};
const outside = (event: PointerEvent) => {
  if (!menu.value?.contains(event.target as Node)) close();
};
const escape = (event: KeyboardEvent) => {
  if (!context.contextMenuOpen.value || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  close();
};
const handleKeys = (event: KeyboardEvent) => {
  if (!['ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(event.key))
    return;
  if (event.key === 'Tab') {
    close();
    return;
  }
  event.preventDefault();
  const buttons = Array.from(
    menu.value?.querySelectorAll<HTMLButtonElement>('button') || []
  );
  const current = buttons.indexOf(doc.activeElement as HTMLButtonElement);
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
          buttons.length;
  buttons[next]?.focus();
};
const run = async (action?: () => unknown) => {
  close();
  try {
    await action?.();
  } catch (error) {
    console.warn('Не удалось изменить состояние устройства в звонке:', error);
  }
};
onMounted(() => {
  doc.addEventListener('contextmenu', open);
  doc.addEventListener('pointerdown', outside, true);
  host.addEventListener('keydown', escape, true);
  host.addEventListener('blur', close);
  host.addEventListener('resize', close);
});
onBeforeUnmount(() => {
  close();
  doc.removeEventListener('contextmenu', open);
  doc.removeEventListener('pointerdown', outside, true);
  host.removeEventListener('keydown', escape, true);
  host.removeEventListener('blur', close);
  host.removeEventListener('resize', close);
});
</script>

<style scoped>
.desktop-call-context-menu {
  position: fixed;
  z-index: 100020;
  width: min(330px, calc(100vw - 16px));
  padding: 6px;
  border: 1px solid var(--border-table);
  border-radius: 12px;
  color: var(--text-primary);
  background: var(--surface-main-modal);
  box-shadow: 0 8px 28px rgb(0 0 0 / 15%);
}
.desktop-call-context-menu > button {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 8px;
  border-radius: 7px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.desktop-call-context-menu button:hover,
.desktop-call-context-menu button:focus-visible {
  background: var(--action-secondary-pressed-bg);
  outline: none;
}
.desktop-call-context-menu > button > svg {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
}
.desktop-call-context-menu small {
  margin-left: auto;
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
}
.desktop-call-context-menu small.desktop-call-context-menu__enabled {
  color: var(--text-link);
}
.desktop-call-context-menu__separator {
  height: 1px;
  margin: 4px 8px;
  background: var(--border-table);
}
.desktop-call-context-menu__reactions {
  display: flex;
  justify-content: space-around;
  padding: 2px 4px;
}
.desktop-call-context-menu__reactions button {
  width: 44px;
  height: 40px;
  border-radius: 7px;
  font-size: 23px;
  cursor: pointer;
}
</style>
