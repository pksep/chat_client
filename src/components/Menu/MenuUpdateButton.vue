<template>
  <div
    v-if="showUpdateBanner"
    :class="['menu-update', { 'menu-update--collapse': props.isCollapse }]"
  >
    <Button
      class="menu-update-button"
      :type="ButtonTypeEnum.primary"
      :size="SizesEnum.small"
      :disabled="isUpdateActionDisabled"
      :aria-label="accessibleLabel"
      :title="accessibleLabel"
      :data-testid="`${props.dataTestid}-MenuUpdateButton`"
      @click="handleUpdateClick"
    >
      <svg
        v-if="updateProgress !== undefined"
        :class="[
          'menu-update-button__progress',
          { 'menu-update-button__progress--pending': !updateProgress }
        ]"
        viewBox="0 0 18 18"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="9" cy="9" r="6" stroke="currentColor" opacity="0.3" />
        <circle
          cx="9"
          cy="9"
          r="6"
          stroke="currentColor"
          stroke-linecap="round"
          :stroke-dasharray="`${((updateProgress || 25) / 100) * 37.7} 37.7`"
          transform="rotate(-90 9 9)"
        />
      </svg>
      <Icon
        v-else
        :name="
          isUpdateDownloaded ? IconNameEnum.checkCircle : IconNameEnum.download
        "
        class="menu-update-button__icon"
        aria-hidden="true"
      />
      <span v-if="!props.isCollapse">{{ actionLabel }}</span>
    </Button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import { useMobileApp } from '../../composables/useMobileApp';

const props = withDefaults(
  defineProps<{ isCollapse?: boolean; dataTestid?: string }>(),
  { isCollapse: false, dataTestid: 'Menu' }
);

const {
  showUpdateBanner,
  updateActionLabel,
  updateProgress,
  updateError,
  isUpdateActionDisabled,
  handleUpdateClick
} = useMobileApp();

const actionLabel = computed(() =>
  updateActionLabel.value === 'Установить и перезапустить'
    ? 'Перезапустить чат'
    : updateActionLabel.value === 'Обновить' ||
        updateActionLabel.value === 'Установить'
      ? 'Обновить чат'
      : updateActionLabel.value
);
const isUpdateDownloaded = computed(
  () =>
    updateActionLabel.value === 'Перезапустить' ||
    updateActionLabel.value === 'Установить и перезапустить' ||
    updateActionLabel.value === 'Установлено'
);
const accessibleLabel = computed(
  () =>
    updateError.value ||
    (updateProgress.value !== undefined
      ? `Загружаем обновление: ${actionLabel.value}`
      : actionLabel.value)
);
</script>

<style scoped>
.menu-update {
  display: flex;
  justify-content: center;
  min-width: 0;
  padding: 10px 0;
}

.menu-update-button.button-yui-kit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 231px;
  max-width: 100%;
  height: 40px;
  min-height: 40px !important;
  padding: 11px 13px;
  gap: 10px;
  border-radius: 5px;
  color: var(--text-on-brand);
  font-size: 16px;
  font-weight: 400;
  line-height: 18px;
}

.menu-update-button.button-yui-kit:disabled {
  background: var(--action-primary-bg);
  color: var(--text-on-brand);
  opacity: 1;
}

.menu-update--collapse .menu-update-button {
  width: 40px;
  padding: 11px;
}

.menu-update-button__icon,
.menu-update-button__progress {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
}

.menu-update-button :deep(.icon-yui-kit) {
  width: 16px;
  height: 16px;
}

.menu-update-button__progress {
  stroke-width: 1.5;
}

.menu-update-button__progress--pending {
  animation: menu-update-spin 1s linear infinite;
}

@keyframes menu-update-spin {
  to {
    transform: rotate(360deg);
  }
}

@media screen and (width <= 768px) {
  .menu-update {
    padding: 10px 16px calc(84px + env(safe-area-inset-bottom, 0px));
  }
}

@media (prefers-reduced-motion: reduce) {
  .menu-update-button__progress--pending {
    animation: none;
  }
}
</style>
