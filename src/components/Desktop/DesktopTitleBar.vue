<template>
  <header
    v-if="visible"
    class="desktop-titlebar"
    :class="{ 'desktop-titlebar--inactive': !focused }"
    data-testid="DesktopTitleBar"
    @mousedown="startDrag"
    @dblclick="toggleMaximize"
  >
    <div class="desktop-titlebar__brand">
      <ChatIcon />
      <span>СЭП Чат</span>
    </div>
    <div class="desktop-titlebar__space" aria-hidden="true" />
    <div
      v-if="desktopScreenCaptureSource"
      class="desktop-titlebar__sharing"
      role="status"
    >
      <span :title="desktopScreenCaptureSource.name"
        >Демонстрация: {{ desktopScreenCaptureSource.name }}</span
      >
      <button
        type="button"
        :disabled="stoppingShare"
        aria-label="Остановить демонстрацию экрана"
        @click="stopSharing"
      >
        Остановить
      </button>
    </div>
    <nav class="desktop-titlebar__controls" aria-label="Управление окном">
      <button
        type="button"
        aria-label="Свернуть"
        title="Свернуть"
        @click="runWindowAction('minimize')"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 10h10" />
        </svg>
      </button>
      <button
        type="button"
        :aria-label="maximized ? 'Восстановить размер' : 'Развернуть'"
        :title="maximized ? 'Восстановить размер' : 'Развернуть'"
        @click="toggleMaximize"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <template v-if="maximized">
            <path d="M7.5 6V4.5h8v8H14" />
            <rect x="4.5" y="7.5" width="8" height="8" rx="1" />
          </template>
          <rect v-else x="5" y="5" width="10" height="10" rx="1.5" />
        </svg>
      </button>
      <button
        type="button"
        class="desktop-titlebar__close"
        aria-label="Закрыть окно"
        title="Закрыть окно"
        @click="runWindowAction('close')"
      >
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="m6 6 8 8M14 6l-8 8" />
        </svg>
      </button>
    </nav>
  </header>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import ChatIcon from '../UI/Icons/ChatIcon.vue';
import { showErrorNotification } from '../../composables/useNotifications';
import {
  markTauriWindowInactive,
  syncTauriWindowState
} from '../../services/useAppVisibility';
import {
  desktopScreenCaptureSource,
  stopDesktopScreenCapture
} from '../../services/desktop-screen-capture';

const visible = ref(false);
const focused = ref(true);
const maximized = ref(false);
const stoppingShare = ref(false);
const listeners: UnlistenFn[] = [];
let disposed = false;

const stopSharing = async () => {
  if (stoppingShare.value) return;
  stoppingShare.value = true;
  try {
    const { state, toggleScreenShare } = await import(
      '../../services/useLiveKit'
    );
    if (state.isScreenSharingActive) await toggleScreenShare();
    else stopDesktopScreenCapture();
  } finally {
    stoppingShare.value = false;
  }
};

const refreshWindow = async () => {
  const appWindow = getCurrentWindow();
  const [decorated, fullscreen, isMaximized] = await Promise.all([
    appWindow.isDecorated(),
    appWindow.isFullscreen(),
    appWindow.isMaximized()
  ]);
  if (disposed) return;
  visible.value = !decorated && !fullscreen;
  maximized.value = isMaximized;
  document.documentElement.classList.toggle(
    'chat-desktop-custom-chrome',
    visible.value
  );
};

const runWindowAction = async (
  action: 'minimize' | 'toggleMaximize' | 'close' | 'startDragging'
) => {
  try {
    if (action === 'minimize' || action === 'close') markTauriWindowInactive();
    await getCurrentWindow()[action]();
    if (action === 'toggleMaximize') await refreshWindow();
  } catch {
    void syncTauriWindowState();
    showErrorNotification(
      'Не удалось изменить состояние окна. Повторите действие.'
    );
  }
};

const toggleMaximize = (event: MouseEvent) => {
  if (
    event.type === 'dblclick' &&
    event.target instanceof Element &&
    event.target.closest('button')
  )
    return;
  void runWindowAction('toggleMaximize');
};

const startDrag = (event: MouseEvent) => {
  if (
    event.button !== 0 ||
    event.detail > 1 ||
    !(event.target instanceof Element) ||
    event.target.closest('button')
  )
    return;
  void runWindowAction('startDragging');
};

onMounted(async () => {
  if (!isTauri()) return;
  try {
    const appWindow = getCurrentWindow();
    const bind = (unlisten: UnlistenFn) => {
      if (disposed) unlisten();
      else listeners.push(unlisten);
    };
    await appWindow
      .onResized(() => {
        void refreshWindow().catch(() => undefined);
      })
      .then(bind);
    await appWindow
      .onFocusChanged(event => {
        focused.value = event.payload;
      })
      .then(bind);
    focused.value = await appWindow.isFocused();
    await refreshWindow();
  } catch (error) {
    console.warn('Не удалось подготовить шапку приложения:', error);
  }
});

onBeforeUnmount(() => {
  disposed = true;
  listeners.forEach(unlisten => unlisten());
  document.documentElement.classList.remove('chat-desktop-custom-chrome');
});
</script>

<style scoped>
.desktop-titlebar {
  position: fixed;
  inset: 0 0 auto;
  z-index: 100010;
  height: var(--desktop-titlebar-height);
  display: flex;
  align-items: center;
  padding: 0 4px 0 14px;
  color: var(--text-primary);
  background: var(--surface-main-modal);
  border-bottom: 1px solid var(--border-table);
  user-select: none;
}

.desktop-titlebar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  pointer-events: none;
}

.desktop-titlebar__brand .chat-icon {
  width: 20px;
  height: 20px;
}

.desktop-titlebar__space {
  flex: 1;
  align-self: stretch;
}

.desktop-titlebar__controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.desktop-titlebar__sharing {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  margin: 0 14px;
  font-size: 11px;
  color: var(--action-primary-bg);
}

.desktop-titlebar__sharing span {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-titlebar__sharing button {
  padding: 5px 9px;
  border-radius: 7px;
  color: var(--action-primary-bg);
  background: var(--action-secondary-pressed-bg);
  font: inherit;
  cursor: pointer;
}

@media (width < 650px) {
  .desktop-titlebar__sharing span {
    display: none;
  }
}

.desktop-titlebar__controls button {
  display: grid;
  place-items: center;
  width: 38px;
  height: 28px;
  padding: 0;
  border-radius: 7px;
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    background-color 120ms ease,
    color 120ms ease;
}

.desktop-titlebar__controls button:hover {
  background: var(--action-secondary-pressed-bg);
  color: var(--text-primary);
}

.desktop-titlebar__controls .desktop-titlebar__close:hover {
  background: var(--action-danger-bg, #e54657);
  color: #fff;
}

.desktop-titlebar__controls button:focus-visible {
  outline: 2px solid var(--action-primary-bg);
  outline-offset: -2px;
}

.desktop-titlebar__controls svg {
  width: 18px;
  height: 18px;
  stroke: currentColor;
  stroke-width: 1.4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.desktop-titlebar--inactive .desktop-titlebar__brand {
  color: var(--text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .desktop-titlebar__controls button {
    transition: none;
  }
}
</style>
