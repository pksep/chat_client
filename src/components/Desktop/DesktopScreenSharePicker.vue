<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="desktop-screen-picker"
      aria-labelledby="desktop-screen-picker-title"
      data-testid="DesktopScreenSharePicker"
      @cancel.prevent="cancel"
    >
      <header class="desktop-screen-picker__header">
        <span class="desktop-screen-picker__heading-icon"
          ><ScreenShareIcon
        /></span>
        <div>
          <h2 id="desktop-screen-picker-title">Демонстрация экрана</h2>
          <p>Выберите, что увидят участники звонка</p>
        </div>
        <button
          type="button"
          class="desktop-screen-picker__close"
          aria-label="Закрыть выбор экрана"
          @click="cancel"
        >
          <Icon :name="IconNameEnum.closeTag" />
        </button>
      </header>
      <template v-if="desktopScreenPicker?.permissionGranted">
        <div
          class="desktop-screen-picker__tabs"
          role="tablist"
          aria-label="Источник демонстрации"
        >
          <button
            v-for="tab in tabs"
            :key="tab.kind"
            type="button"
            role="tab"
            :tabindex="kind === tab.kind ? 0 : -1"
            :id="`desktop-screen-tab-${tab.kind}`"
            aria-controls="desktop-screen-sources"
            :aria-selected="kind === tab.kind"
            :class="{ 'desktop-screen-picker__tab--active': kind === tab.kind }"
            @click="kind = tab.kind"
            @keydown="handleTabKey"
          >
            {{ tab.label }}
          </button>
        </div>
        <div
          id="desktop-screen-sources"
          class="desktop-screen-picker__sources"
          role="tabpanel"
          :aria-labelledby="`desktop-screen-tab-${kind}`"
          :aria-busy="loading"
        >
          <p v-if="loading" class="desktop-screen-picker__empty" role="status">
            Загружаем доступные источники…
          </p>
          <p
            v-else-if="!filteredSources.length && !error"
            class="desktop-screen-picker__empty"
          >
            {{
              kind === 'window'
                ? 'Нет доступных окон. Откройте нужное приложение и обновите список.'
                : 'Нет доступных экранов.'
            }}
          </p>
          <button
            v-for="(source, index) in filteredSources"
            v-else
            :key="source.id"
            type="button"
            class="desktop-screen-picker__source"
            :class="{
              'desktop-screen-picker__source--selected':
                selected?.id === source.id
            }"
            :aria-pressed="selected?.id === source.id"
            @click="selected = source"
          >
            <span
              class="desktop-screen-picker__source-preview"
              aria-hidden="true"
            >
              <svg viewBox="0 0 80 64" fill="none">
                <rect x="10" y="8" width="60" height="40" rx="5" />
                <path v-if="source.kind === 'screen'" d="M40 48v10M28 58h24" />
                <path v-else d="M10 19h60M18 14h1m5 0h1" />
              </svg>
              <span v-if="source.kind === 'screen'">{{ index + 1 }}</span>
            </span>
            <span class="desktop-screen-picker__source-name">{{
              source.name
            }}</span>
            <span
              v-if="selected?.id === source.id"
              class="desktop-screen-picker__selected-check"
              aria-hidden="true"
              >✓</span
            >
          </button>
        </div>
      </template>
      <div v-else class="desktop-screen-picker__permission">
        <ScreenShareIcon />
        <h3>Разрешите запись экрана</h3>
        <p>
          Предоставьте SEP Chat доступ к записи экрана в настройках системы,
          затем обновите список источников.
        </p>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.medium"
          :disabled="loading"
          @click="requestPermission"
          >Разрешить доступ</Button
        >
      </div>
      <p v-if="error" class="desktop-screen-picker__error" role="alert">
        {{ error }}
      </p>
      <footer class="desktop-screen-picker__footer">
        <button
          v-if="desktopScreenPicker?.permissionGranted"
          type="button"
          class="desktop-screen-picker__refresh"
          :disabled="loading"
          @click="loadSources"
        >
          Обновить список
        </button>
        <div class="desktop-screen-picker__actions">
          <Button
            :type="ButtonTypeEnum.secondary"
            :size="SizesEnum.medium"
            @click="cancel"
            >Отмена</Button
          >
          <Button
            :type="ButtonTypeEnum.primary"
            :size="SizesEnum.medium"
            :disabled="
              !selected || loading || !desktopScreenPicker?.permissionGranted
            "
            @click="share"
            >Поделиться</Button
          >
        </div>
      </footer>
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
import ScreenShareIcon from '../CallModal/UI/ScreenShareIcon.vue';
import {
  desktopScreenPicker,
  loadDesktopCaptureSources,
  requestDesktopScreenCapturePermission,
  resolveDesktopScreenPicker,
  type DesktopCaptureSource
} from '../../services/desktop-screen-capture';

const dialog = ref<HTMLDialogElement>();
const sources = ref<DesktopCaptureSource[]>([]);
const kind = ref<'screen' | 'window'>('screen');
const selected = ref<DesktopCaptureSource | null>(null);
const loading = ref(false);
const error = ref('');
const tabs = [
  { kind: 'screen', label: 'Весь экран' },
  { kind: 'window', label: 'Окно приложения' }
] as const;
const filteredSources = computed(() =>
  sources.value.filter(source => source.kind === kind.value)
);
let generation = 0;
const handleTabKey = (event: KeyboardEvent) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  kind.value =
    event.key === 'Home'
      ? 'screen'
      : event.key === 'End'
        ? 'window'
        : kind.value === 'screen'
          ? 'window'
          : 'screen';
  void nextTick(() =>
    document.getElementById(`desktop-screen-tab-${kind.value}`)?.focus()
  );
};
const cancel = () => resolveDesktopScreenPicker(null);
const share = () => {
  if (selected.value && !loading.value)
    resolveDesktopScreenPicker(selected.value);
};
const loadSources = async () => {
  const current = ++generation;
  loading.value = true;
  error.value = '';
  try {
    const result = await loadDesktopCaptureSources();
    if (current !== generation || !desktopScreenPicker.value) return;
    sources.value = result;
    selected.value =
      result.find(source => source.id === selected.value?.id) || null;
  } catch (failure) {
    if (current === generation) {
      error.value = String(failure);
      selected.value = null;
      sources.value = [];
    }
  } finally {
    if (current === generation) loading.value = false;
  }
};
const requestPermission = async () => {
  loading.value = true;
  error.value = '';
  try {
    if (!(await requestDesktopScreenCapturePermission()))
      error.value =
        'Доступ к записи экрана пока не разрешён. Проверьте настройки системы.';
  } catch (failure) {
    error.value = String(failure);
  } finally {
    loading.value = false;
  }
};
watch(
  desktopScreenPicker,
  async (request, previous) => {
    await nextTick();
    if (request && desktopScreenPicker.value === request) {
      if (!previous) {
        selected.value = null;
        sources.value = [];
        error.value = '';
        kind.value = 'screen';
      }
      if (!dialog.value?.open) dialog.value?.showModal();
      if (request.permissionGranted) void loadSources();
    } else if (!desktopScreenPicker.value) {
      generation++;
      dialog.value?.close();
    }
  },
  { immediate: true }
);
watch(kind, () => {
  selected.value = null;
});
onBeforeUnmount(() => {
  generation++;
  cancel();
});
</script>

<style scoped>
.desktop-screen-picker {
  position: fixed;
  inset: var(--desktop-content-top, 0px) 0 0;
  margin: auto;
  width: min(700px, calc(100vw - 40px));
  max-height: calc(var(--app-viewport-height, 100dvh) - 40px);
  box-sizing: border-box;
  padding: 28px;
  border: 1px solid var(--border-table);
  border-radius: 20px;
  background: var(--surface-main-modal);
  color: var(--text-primary);
  box-shadow: 0 16px 60px rgb(0 0 0 / 14%);
}
.desktop-screen-picker[open] {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.desktop-screen-picker::backdrop {
  background: rgb(28 38 53 / 45%);
}
.desktop-screen-picker__header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}
.desktop-screen-picker__heading-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: var(--action-primary-bg);
  background: var(--action-secondary-pressed-bg);
  flex-shrink: 0;
}
.desktop-screen-picker__heading-icon svg {
  width: 26px;
  height: 26px;
}
h2 {
  margin: 0 0 5px;
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
.desktop-screen-picker__close {
  display: grid;
  place-items: center;
  margin-left: auto;
  align-self: flex-start;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
}
.desktop-screen-picker__close:hover {
  background: var(--action-secondary-pressed-bg);
}
.desktop-screen-picker__tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background: var(--surface-input-secondary);
}
.desktop-screen-picker__tabs button {
  flex: 1;
  padding: 10px 12px;
  border-radius: 9px;
  color: var(--text-secondary);
  font: inherit;
  font-size: 14px;
  cursor: pointer;
}
.desktop-screen-picker__tabs .desktop-screen-picker__tab--active {
  color: var(--action-primary-bg);
  background: var(--surface-main-modal);
  box-shadow: 0 2px 5px rgb(0 0 0 / 5%);
}
.desktop-screen-picker__sources {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  min-height: 180px;
  max-height: 360px;
  overflow-y: auto;
  padding: 2px;
}
.desktop-screen-picker__source {
  position: relative;
  padding: 10px;
  border: 1px solid var(--border-table);
  border-radius: 14px;
  text-align: left;
  cursor: pointer;
  color: var(--text-primary);
  min-width: 0;
}
.desktop-screen-picker__source:hover {
  background: var(--action-secondary-pressed-bg);
}
.desktop-screen-picker__source--selected {
  border-color: var(--action-primary-bg);
  box-shadow: 0 0 0 1px var(--action-primary-bg);
}
.desktop-screen-picker__source-preview {
  position: relative;
  height: 115px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--surface-input-secondary);
  color: var(--action-primary-bg);
}
.desktop-screen-picker__source-preview svg {
  width: 80px;
  height: 64px;
  stroke: currentColor;
  stroke-width: 2;
}
.desktop-screen-picker__source-preview span {
  position: absolute;
  top: 43px;
  font-size: 16px;
  font-weight: 600;
}
.desktop-screen-picker__source-name {
  display: block;
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.4;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.desktop-screen-picker__selected-check {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--text-on-brand);
  background: var(--action-primary-bg);
}
.desktop-screen-picker__empty {
  grid-column: 1 / -1;
  align-self: center;
  text-align: center;
  padding: 20px;
}
.desktop-screen-picker__permission {
  display: grid;
  justify-items: center;
  gap: 14px;
  padding: 20px;
  text-align: center;
}
.desktop-screen-picker__permission > svg {
  color: var(--action-primary-bg);
}
.desktop-screen-picker__permission h3 {
  font-size: 18px;
  line-height: 1.3;
}
.desktop-screen-picker__error {
  color: var(--text-error, #d94252);
}
.desktop-screen-picker__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.desktop-screen-picker__refresh {
  color: var(--action-primary-bg);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.desktop-screen-picker__actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}
.desktop-screen-picker__actions :deep(button) {
  min-width: 120px;
  justify-content: center;
  border-radius: 10px;
}
button:focus-visible {
  outline: 2px solid var(--action-primary-bg);
  outline-offset: 2px;
}
@media (width < 500px) {
  .desktop-screen-picker {
    padding: 20px;
  }
  .desktop-screen-picker__header {
    gap: 10px;
  }
  .desktop-screen-picker__heading-icon {
    display: none;
  }
  .desktop-screen-picker__sources {
    grid-template-columns: 1fr;
    max-height: 300px;
  }
  .desktop-screen-picker__source-preview {
    height: 90px;
  }
  .desktop-screen-picker__source-preview span {
    top: 30px;
  }
}
</style>
