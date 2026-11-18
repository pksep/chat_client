<template>
  <div class="menu-profile__update menu-profile__update--desktop">
    <button
      type="button"
      class="menu-profile__wallpapers-trigger"
      :aria-expanded="isExpanded"
      :aria-controls="menuId"
      :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateTrigger`"
      @click="toggleExpanded"
    >
      <span class="menu-profile__wallpapers-trigger-title">
        Проверить обновления
      </span>
      <Icon
        :name="isExpanded ? IconNameEnum.chevronUp : IconNameEnum.chevronDown"
        :width="24"
        :height="16"
      />
    </button>

    <div
      v-if="isExpanded"
      :id="menuId"
      class="menu-profile__update-menu"
      :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateMenu`"
    >
      <div class="menu-profile__update-content">
        <div
          class="menu-profile__update-copy"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p class="menu-profile__update-title">{{ copy.title }}</p>
          <p
            class="menu-profile__update-description"
            :data-testid="
              props.state.phase === 'latest' ? 'DesktopAppVersion' : undefined
            "
          >
            {{ props.state.error || copy.description }}
          </p>
        </div>

        <div class="menu-profile__update-action-slot">
          <Button
            v-if="!isBusy && props.state.phase !== 'latest'"
            :type="ButtonTypeEnum.primary"
            :size="SizesEnum.small"
            class="menu-profile__update-action"
            :aria-label="actionDescription"
            :title="actionDescription"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateAction`"
            @click="handleAction"
          >
            {{ actionLabel }}
          </Button>
          <span
            v-else-if="props.state.phase === 'latest'"
            class="menu-profile__update-check"
            aria-hidden="true"
          >
            <svg viewBox="0 0 18 18" fill="none">
              <path
                d="M5 9.2L7.7 12L13.2 6"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <div
            v-else
            class="menu-profile__update-progress"
            role="progressbar"
            :aria-label="copy.title"
            :aria-valuenow="
              props.state.phase === 'downloading' &&
              props.state.progress !== null
                ? props.state.progress
                : undefined
            "
            :aria-valuetext="progressLabel"
          >
            <span v-if="props.state.phase === 'downloading'">
              {{
                props.state.progress === null ? '…' : `${props.state.progress}%`
              }}
            </span>
            <svg
              class="desktop-update__progress-ring"
              viewBox="0 0 36 36"
              aria-hidden="true"
            >
              <circle
                class="desktop-update__progress-track"
                cx="18"
                cy="18"
                r="17"
              />
              <circle
                class="desktop-update__progress-value"
                :class="{
                  'desktop-update__progress-value--indeterminate':
                    isIndeterminate
                }"
                cx="18"
                cy="18"
                r="8"
                pathLength="100"
                :stroke-dasharray="`${isIndeterminate ? 25 : props.state.progress} 100`"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import type {
  DesktopUpdateState,
  DesktopUpdatePhase
} from '../../services/desktop-updater';
import { DESKTOP_UPDATE_MESSAGES } from '../../services/desktop-update-messages';

const props = defineProps<{
  state: DesktopUpdateState;
  version: string;
  dataTestid: string;
}>();
const emit = defineEmits<{ check: []; update: [] }>();
const isExpanded = ref(false);
const menuId = useId();
const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value;
  if (
    isExpanded.value &&
    ['idle', 'latest', 'error'].includes(props.state.phase)
  )
    emit('check');
};
const isBusy = computed(() =>
  ['checking', 'downloading', 'installing'].includes(props.state.phase)
);
const isIndeterminate = computed(
  () => props.state.phase !== 'downloading' || props.state.progress === null
);
const copies = computed<
  Record<DesktopUpdatePhase, { title: string; description: string }>
>(() => ({
  idle: {
    title: 'Проверить обновления',
    description: 'Нажмите, чтобы проверить доступные обновления'
  },
  checking: {
    title: 'Проверяем обновления',
    description: 'Пожалуйста, подождите несколько секунд'
  },
  available: {
    title: 'Доступна новая версия',
    description: 'Обновите приложение, чтобы получить новые функции'
  },
  downloading: {
    title: 'Загружаем обновление',
    description: 'Пожалуйста, не закрывайте приложение'
  },
  downloaded: {
    title: 'Готово к установке',
    description: 'Для установки перезагрузите приложение'
  },
  installing: {
    title: 'Устанавливаем обновление',
    description: 'Пожалуйста, не закрывайте приложение'
  },
  latest: {
    title: 'Установлена новейшая версия',
    description:
      `Сейчас у вас актуальная версия приложения ${props.version}`.trim()
  },
  error: {
    title: 'Не удалось обновить приложение',
    description: DESKTOP_UPDATE_MESSAGES.checkFailed
  }
}));
const copy = computed(() => copies.value[props.state.phase]);
const actionLabel = computed(() =>
  props.state.phase === 'available'
    ? 'Обновить'
    : props.state.phase === 'downloaded'
      ? 'Перезагрузить'
      : 'Проверить'
);
const actionDescription = computed(() =>
  props.state.phase === 'available'
    ? `Скачать обновление${props.state.version ? ` до версии ${props.state.version}` : ''}`
    : props.state.phase === 'downloaded'
      ? 'Установить и перезапустить'
      : 'Проверить обновления'
);
const progressLabel = computed(() =>
  props.state.phase === 'checking'
    ? 'Проверяем…'
    : props.state.phase === 'installing'
      ? 'Установка…'
      : props.state.progress === null
        ? 'Загрузка обновления…'
        : `Загрузка: ${props.state.progress}%`
);
const handleAction = () => {
  if (['idle', 'error'].includes(props.state.phase)) emit('check');
  else emit('update');
};
</script>

<style scoped>
.menu-profile__wallpapers-trigger {
  width: 100%;
  gap: 10px;
  text-align: left;
  font: inherit;
}
.menu-profile__wallpapers-trigger-title {
  flex: 1;
  min-width: 0;
  line-height: 17px;
}
.menu-profile__wallpapers-trigger :deep(svg) {
  flex-shrink: 0;
}
.menu-profile__update-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
}
.menu-profile__update-copy {
  overflow-wrap: anywhere;
}
.menu-profile__update-description {
  max-width: none;
  font-weight: 400;
}
.menu-profile__update-action-slot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}
.menu-profile__update-action.button-yui-kit {
  font-weight: 400;
}
.menu-profile__update-progress > span {
  min-width: 3ch;
  text-align: right;
}
.menu-profile__update-progress {
  width: 74px;
  justify-content: flex-end;
}
.desktop-update__progress-ring {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  overflow: visible;
}
.desktop-update__progress-track {
  fill: var(--surface-input-primary);
}
.desktop-update__progress-value {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  transform: rotate(-90deg);
  transform-origin: center;
  transition: stroke-dasharray 0.2s ease;
}
.desktop-update__progress-value--indeterminate {
  animation: desktop-update-spin 1s linear infinite;
}
@keyframes desktop-update-spin {
  to {
    transform: rotate(270deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .desktop-update__progress-value {
    animation: none;
    transition: none;
  }
}
</style>
