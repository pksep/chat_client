<template>
  <div
    ref="containerRef"
    class="menu-profile__update menu-profile__update--desktop"
    :class="{ 'menu-profile__update--compact': isCompact }"
    :style="{ '--profile-update-action-width': `${actionWidth}px` }"
  >
    <button
      type="button"
      class="menu-profile__wallpapers-trigger"
      :aria-expanded="isExpanded"
      :aria-controls="menuId"
      :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateTrigger`"
      @click="isExpanded = !isExpanded"
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
      ref="actionMeasureRef"
      class="desktop-update__action-measure"
      aria-hidden="true"
    >
      <span
        v-for="label in actionLabels"
        :key="label"
        :data-measure-text="label"
      />
    </div>

    <div
      v-if="isExpanded"
      :id="menuId"
      class="menu-profile__update-menu"
      :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateMenu`"
    >
      <div class="menu-profile__update-content">
        <span
          class="menu-profile__update-status-icon"
          :class="{
            'menu-profile__update-status-icon--latest':
              props.state.phase === 'latest'
          }"
          aria-hidden="true"
          inert
        >
          <FileIcon
            v-if="isBusy"
            :is-me-sender="false"
            :is-loaded="false"
            :percent="
              props.state.phase === 'downloading' ? props.state.progress : null
            "
            background-color="var(--grey2)"
          />
          <span
            v-else-if="props.state.phase === 'error'"
            class="desktop-update__error-icon"
            >!</span
          >
          <svg
            v-else-if="['latest', 'downloaded'].includes(props.state.phase)"
            viewBox="0 0 18 18"
            fill="none"
          >
            <path
              d="M5 9.2L7.7 12L13.2 6"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <svg v-else viewBox="0 0 18 18" fill="none">
            <path
              d="M14 11.25V14C14 14.2761 13.883 14.5412 13.6746 14.7366C13.4662 14.932 13.1836 15.0417 12.8889 15.0417H5.11111C4.81643 15.0417 4.53381 14.932 4.32544 14.7366C4.11706 14.5412 4 14.2761 4 14V11.25"
              stroke="currentColor"
              stroke-width="1.375"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path
              d="M6.39587 7.95996L9.00003 10.5641L11.6042 7.95996M9 10.5654V4.31543"
              stroke="currentColor"
              stroke-width="1.375"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>

        <div
          class="menu-profile__update-copy"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div class="menu-profile__update-title desktop-update__text-slot">
            <span
              v-for="title in titles"
              :key="title"
              class="desktop-update__text-measure"
              :data-measure-text="title"
              aria-hidden="true"
            />
            <p>{{ copy.title }}</p>
          </div>
          <div
            class="menu-profile__update-description desktop-update__text-slot"
          >
            <span
              v-for="description in descriptions"
              :key="description"
              class="desktop-update__text-measure"
              :data-measure-text="description"
              aria-hidden="true"
            />
            <p>{{ props.state.error || copy.description }}</p>
          </div>
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
            data-testid="DesktopAppVersion"
          >
            Версия {{ props.version || '…' }}
          </span>
          <span v-else role="status">{{ progressLabel }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from 'vue';
import { useResizeObserver } from '@vueuse/core';
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
import FileIcon from '../UI/FileIcon.vue';

const props = defineProps<{
  state: DesktopUpdateState;
  version: string;
  dataTestid: string;
}>();
const emit = defineEmits<{ check: []; update: [] }>();
const isExpanded = ref(false);
const menuId = useId();
const containerRef = useTemplateRef<HTMLElement>('containerRef');
const actionMeasureRef = useTemplateRef<HTMLElement>('actionMeasureRef');
const containerWidth = ref(0);
const actionWidth = ref(86);
const actionLabels = ['Обновить чат', 'Перезапустить чат', 'Проверить'];
// Размеры зависят только от ширины и шрифта. Ответы updater и проценты их не меняют.
useResizeObserver(containerRef, ([entry]) => {
  containerWidth.value = entry.contentRect.width;
});
useResizeObserver(actionMeasureRef, ([entry]) => {
  actionWidth.value = Math.max(
    86,
    Math.ceil(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width)
  );
});
const isCompact = computed(
  () => containerWidth.value - 22 - 56 - actionWidth.value < 140
);
const isBusy = computed(() =>
  ['checking', 'downloading', 'installing'].includes(props.state.phase)
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
    title: 'Обновление загружено',
    description: 'Установите обновление и перезапустите приложение'
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
const titles = computed(() => [
  ...new Set(Object.values(copies.value).map(item => item.title))
]);
const descriptions = computed(() => [
  ...new Set([
    ...Object.values(copies.value).map(item => item.description),
    ...Object.values(DESKTOP_UPDATE_MESSAGES)
  ])
]);
const actionLabel = computed(() =>
  props.state.phase === 'available'
    ? 'Обновить чат'
    : props.state.phase === 'downloaded'
      ? 'Перезапустить чат'
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
.menu-profile__update--desktop {
  position: relative;
  min-width: 0;
}
.menu-profile__wallpapers-trigger {
  width: 100%;
  gap: 10px;
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.menu-profile__wallpapers-trigger-title {
  flex: 1;
  min-width: 0;
  line-height: 17px;
}
.menu-profile__wallpapers-trigger :deep(svg) {
  flex-shrink: 0;
}
.desktop-update__action-measure {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  width: max-content;
  min-width: 86px;
  padding: 0 10px;
  visibility: hidden;
  pointer-events: none;
  font-size: 12px;
  line-height: 15px;
  font-weight: 400;
}
.desktop-update__action-measure > span,
.desktop-update__text-slot > * {
  grid-area: 1 / 1;
}
[data-measure-text]::before {
  content: attr(data-measure-text);
}
.menu-profile__update-content {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) minmax(
      0,
      var(--profile-update-action-width)
    );
  align-items: center;
}
.menu-profile__update-status-icon {
  grid-column: 1;
  grid-row: 1;
}
.menu-profile__update-status-icon--latest {
  background: var(--surface-input-primary);
  color: var(--action-primary-bg);
}
.menu-profile__update-status-icon :deep(.button-yui-kit) {
  width: 36px;
  height: 36px;
  min-width: 0;
  min-height: 0;
  padding: 0;
  pointer-events: none;
}
.menu-profile__update-status-icon :deep(svg) {
  width: 36px;
  height: 36px;
}
.menu-profile__update-status-icon > svg {
  width: 20px;
  height: 20px;
}
.menu-profile__update-status-icon--latest > svg {
  width: 22px;
  height: 22px;
}
.desktop-update__error-icon {
  font-size: 20px;
  line-height: 24px;
}
.menu-profile__update-copy {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
}
.desktop-update__text-slot {
  display: grid;
  overflow-wrap: anywhere;
  max-width: none;
}
.desktop-update__text-slot > p {
  margin: 0;
}
.menu-profile__update-title > p {
  align-self: end;
}
.menu-profile__update-description > p {
  align-self: start;
}
.desktop-update__text-measure {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}
.menu-profile__update-action-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  grid-column: 3;
  grid-row: 1;
  width: var(--profile-update-action-width);
  max-width: 100%;
  min-height: 36px;
  font-size: 14px;
  line-height: 16px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--text-link);
  overflow-wrap: anywhere;
}
.menu-profile__update-action.button-yui-kit {
  width: 100%;
  font-weight: 400;
}
.menu-profile__update--compact .menu-profile__update-content {
  grid-template-columns: 36px minmax(0, 1fr);
}
.menu-profile__update--compact .menu-profile__update-action-slot {
  grid-column: 1 / -1;
  grid-row: 2;
  justify-self: end;
}
</style>
