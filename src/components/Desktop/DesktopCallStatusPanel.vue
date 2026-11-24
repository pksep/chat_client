<template>
  <Teleport v-if="isTauri()" :to="desktopOverlayTarget">
    <dialog
      ref="dialog"
      class="desktop-call-status"
      aria-labelledby="desktop-call-status-title"
      data-testid="DesktopCallStatusPanel"
      @cancel.prevent="close"
      @click="backdrop"
    >
      <header>
        <h2 id="desktop-call-status-title">Статус звонка</h2>
        <button type="button" aria-label="Закрыть статус звонка" @click="close">
          ×
        </button>
      </header>
      <p>
        {{
          callOpen
            ? isIncoming
              ? 'Входящий звонок'
              : isCalling
                ? 'Соединение…'
                : 'Звонок идёт'
            : 'Сейчас нет активного звонка'
        }}
      </p>
      <ul aria-label="Устройства звонка">
        <li v-for="device in devices" :key="device.id">
          <button
            type="button"
            :disabled="!canControl || busy"
            :aria-label="device.actionLabel"
            @click="toggle(device.action)"
          >
            <component :is="device.icon" />
            <span
              ><strong>{{ device.label }}</strong
              ><small>{{ device.permission }}</small></span
            >
            <b :class="{ 'desktop-call-status__enabled': device.enabled }">{{
              device.status
            }}</b>
          </button>
        </li>
      </ul>
      <p v-if="error" role="alert">{{ error }}</p>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  desktopCallStatusVisible,
  requestDesktopCallStatus
} from '../../services/desktop-call-status';
import { desktopOverlayTarget } from '../../services/desktop-overlay-target';
import {
  open as callOpen,
  isIncoming,
  isCalling,
  state
} from '../../services/useCallState';
import {
  getDesktopPermissionChoice,
  type DesktopPermission
} from '../../services/desktop-permission-preferences';
import MicIcon from '../CallModal/UI/MicIcon.vue';
import VideoIcon from '../CallModal/UI/VideoIcon.vue';
import ScreenShareIcon from '../CallModal/UI/ScreenShareIcon.vue';

const dialog = ref<HTMLDialogElement>();
const busy = ref(false);
const error = ref('');
const canControl = computed(
  () => callOpen.value && !isIncoming.value && !isCalling.value
);
const permissionText = (permission: DesktopPermission) => {
  const choice = getDesktopPermissionChoice(permission);
  return choice === 'granted'
    ? 'Доступ разрешён'
    : choice === 'denied'
      ? 'Доступ не разрешён'
      : 'Доступ ещё не запрошен';
};
const devices = computed(() => [
  {
    id: 'microphone',
    label: 'Микрофон',
    icon: MicIcon,
    enabled: callOpen.value && state.isMicActive,
    status: callOpen.value && state.isMicActive ? 'Включён' : 'Выключен',
    permission: permissionText('microphone'),
    actionLabel: state.isMicActive ? 'Выключить микрофон' : 'Включить микрофон',
    action: 'toggleMic' as const
  },
  {
    id: 'camera',
    label: 'Камера',
    icon: VideoIcon,
    enabled: callOpen.value && state.isVideoActive,
    status: callOpen.value && state.isVideoActive ? 'Включена' : 'Выключена',
    permission: permissionText('camera'),
    actionLabel: state.isVideoActive ? 'Выключить камеру' : 'Включить камеру',
    action: 'toggleVideo' as const
  },
  {
    id: 'screen-capture',
    label: 'Демонстрация экрана',
    icon: ScreenShareIcon,
    enabled: callOpen.value && state.isScreenSharingActive,
    status:
      callOpen.value && state.isScreenSharingActive ? 'Включена' : 'Выключена',
    permission: permissionText('screen-capture'),
    actionLabel: state.isScreenSharingActive
      ? 'Остановить демонстрацию'
      : 'Начать демонстрацию',
    action: 'toggleScreenShare' as const
  }
]);
const close = () => {
  desktopCallStatusVisible.value = false;
};
const backdrop = (event: MouseEvent) => {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    close();
};
const toggle = async (
  action: 'toggleMic' | 'toggleVideo' | 'toggleScreenShare'
) => {
  if (!canControl.value || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    // Освобождаем верхний слой для запроса доступа или выбора экрана.
    close();
    const call = await import('../../services/useLiveKit');
    await call[action]();
  } catch {
    error.value = 'Не удалось изменить состояние устройства.';
  } finally {
    busy.value = false;
  }
};
watch([desktopCallStatusVisible, desktopOverlayTarget], async () => {
  dialog.value?.close();
  await nextTick();
  if (desktopCallStatusVisible.value && !dialog.value?.open)
    dialog.value?.showModal();
});
let unlisten: UnlistenFn | undefined;
let disposed = false;
onMounted(async () => {
  if (!isTauri()) return;
  unlisten = await listen(
    'sep-chat://call-status-requested',
    requestDesktopCallStatus
  );
  if (disposed) unlisten();
});
onBeforeUnmount(() => {
  disposed = true;
  unlisten?.();
  close();
});
</script>

<style scoped>
.desktop-call-status {
  width: min(420px, calc(100vw - 32px));
  max-height: calc(var(--app-viewport-height, 100dvh) - 32px);
  box-sizing: border-box;
  inset: var(--desktop-content-top, 0px) 0 0;
  margin: auto;
  padding: 24px;
  border: 1px solid var(--border-table);
  border-radius: 16px;
  background: var(--surface-main-modal);
  color: var(--text-primary);
  box-shadow: 0 16px 60px rgb(0 0 0 / 14%);
}
.desktop-call-status::backdrop {
  background: rgb(28 38 53 / 35%);
}
.desktop-call-status header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.desktop-call-status h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}
.desktop-call-status header button {
  font-size: 26px;
  color: var(--text-secondary);
  cursor: pointer;
}
.desktop-call-status p {
  margin: 10px 0 16px;
  font-size: 13px;
  color: var(--text-secondary);
}
.desktop-call-status ul {
  padding: 0;
  margin: 0;
  list-style: none;
}
.desktop-call-status li + li {
  border-top: 1px solid var(--border-table);
}
.desktop-call-status li button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 14px 0;
  text-align: left;
  color: inherit;
  cursor: pointer;
}
.desktop-call-status li button:disabled {
  cursor: default;
}
.desktop-call-status li svg {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  color: var(--text-secondary);
}
.desktop-call-status li span {
  flex: 1;
}
.desktop-call-status strong {
  display: block;
  font-size: 13px;
  font-weight: 500;
}
.desktop-call-status small {
  display: block;
  margin-top: 3px;
  color: var(--text-secondary);
  font-size: 11px;
}
.desktop-call-status b {
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 400;
}
.desktop-call-status b.desktop-call-status__enabled {
  color: var(--text-link);
}
.desktop-call-status button:focus-visible {
  outline: 2px solid var(--text-link);
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
