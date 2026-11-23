<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="desktop-media-permission"
      aria-labelledby="desktop-media-permission-title"
      aria-describedby="desktop-media-permission-description"
      data-testid="DesktopMediaPermissionDialog"
      @cancel.prevent="resolveDesktopMediaPermission(false)"
      @click="handleBackdrop"
    >
      <button
        type="button"
        class="desktop-media-permission__close"
        aria-label="Закрыть запрос доступа"
        @click="resolveDesktopMediaPermission(false)"
      >
        <Icon :name="IconNameEnum.closeTag" />
      </button>
      <span class="desktop-media-permission__icon" aria-hidden="true">
        <VideoIcon v-if="needsCamera" />
        <MicIcon v-else />
      </span>
      <h2 id="desktop-media-permission-title">{{ title }}</h2>
      <p id="desktop-media-permission-description">
        {{ description }}
      </p>
      <ul
        class="desktop-media-permission__list"
        aria-label="Запрашиваемые разрешения"
      >
        <li v-if="needsMicrophone">
          <MicIcon aria-hidden="true" />
          <span
            ><strong>Микрофон</strong
            ><span>Звонки и голосовые сообщения</span></span
          >
          <span class="desktop-media-permission__status">Нужен доступ</span>
        </li>
        <li v-if="needsCamera">
          <VideoIcon aria-hidden="true" />
          <span><strong>Камера</strong><span>Видео во время звонка</span></span>
          <span class="desktop-media-permission__status">Нужен доступ</span>
        </li>
      </ul>
      <div class="desktop-media-permission__actions">
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.medium"
          @click="resolveDesktopMediaPermission(false)"
        >
          Не сейчас
        </Button>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.medium"
          autofocus
          @click="resolveDesktopMediaPermission(true)"
        >
          Разрешить
        </Button>
      </div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import MicIcon from '../CallModal/UI/MicIcon.vue';
import VideoIcon from '../CallModal/UI/VideoIcon.vue';
import {
  desktopMediaPermissionRequest,
  resolveDesktopMediaPermission
} from '../../services/desktop-media-permissions';

const dialog = ref<HTMLDialogElement>();
const needsCamera = computed(() =>
  desktopMediaPermissionRequest.value?.permissions.includes('camera')
);
const needsMicrophone = computed(() =>
  desktopMediaPermissionRequest.value?.permissions.includes('microphone')
);
const title = computed(() =>
  needsCamera.value && needsMicrophone.value
    ? 'Разрешить доступ к камере и микрофону?'
    : needsCamera.value
      ? 'Разрешить доступ к камере?'
      : 'Разрешить доступ к микрофону?'
);
const description = computed(() =>
  needsCamera.value && needsMicrophone.value
    ? 'СЭП Чат использует камеру и микрофон для видеозвонков. Вы сможете выключить их в любой момент.'
    : needsCamera.value
      ? 'СЭП Чат использует камеру для видеозвонков. Вы сможете выключить её в любой момент.'
      : 'СЭП Чат использует микрофон для звонков и голосовых сообщений. Вы сможете выключить его в любой момент.'
);

watch(
  desktopMediaPermissionRequest,
  async request => {
    await nextTick();
    if (request && desktopMediaPermissionRequest.value === request) {
      if (!dialog.value?.open) dialog.value?.showModal();
    } else if (!desktopMediaPermissionRequest.value) {
      dialog.value?.close();
    }
  },
  { immediate: true }
);

const handleBackdrop = (event: MouseEvent) => {
  if (event.target !== dialog.value) return;
  const bounds = dialog.value.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    resolveDesktopMediaPermission(false);
};

onBeforeUnmount(() => resolveDesktopMediaPermission(false));
</script>

<style scoped>
.desktop-media-permission {
  position: fixed;
  inset: var(--desktop-content-top, 0px) 0 0;
  width: min(420px, calc(100vw - 40px));
  max-height: calc(var(--app-viewport-height, 100dvh) - 40px);
  box-sizing: border-box;
  margin: auto;
  padding: 28px;
  border: 1px solid var(--border-table);
  border-radius: 20px;
  color: var(--text-primary);
  background: var(--surface-main-modal);
  box-shadow: 0 16px 60px rgb(0 0 0 / 14%);
}

.desktop-media-permission[open] {
  display: grid;
  justify-items: start;
  gap: 16px;
}

.desktop-media-permission::backdrop {
  background: rgb(28 38 53 / 45%);
}

.desktop-media-permission__close {
  position: absolute;
  top: 14px;
  right: 14px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
}

.desktop-media-permission__close:hover {
  background: var(--action-secondary-pressed-bg);
}

.desktop-media-permission__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  color: var(--action-primary-bg);
  background: var(--action-secondary-pressed-bg);
}

.desktop-media-permission__icon svg {
  width: 28px;
  height: 28px;
}

h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.3;
}

p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
}

.desktop-media-permission__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  width: 100%;
  margin-top: 8px;
}

.desktop-media-permission__list {
  width: 100%;
  padding: 0;
  margin: 0;
  list-style: none;
}
.desktop-media-permission__list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-table);
  font-size: 13px;
}
.desktop-media-permission__list li > svg {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  color: var(--text-secondary);
}
.desktop-media-permission__list li > span:first-of-type {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.desktop-media-permission__list strong {
  font-size: 14px;
}
.desktop-media-permission__list span span {
  color: var(--text-secondary);
}
.desktop-media-permission__status {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--text-secondary);
}

.desktop-media-permission__actions :deep(button) {
  justify-content: center;
  min-width: 120px;
  border-radius: 10px;
}
</style>
