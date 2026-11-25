<template>
  <div class="ai-composer-settings" aria-label="Настройки ИИ-ассистента">
    <Button
      v-if="props.project"
      class="toolbar-button ai-assistant__response-trigger ai-composer-settings__folder"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      :disabled="props.directoryPending"
      :title="props.project.directory || 'Выбрать папку проекта'"
      :aria-label="
        props.project.directory
          ? 'Сменить папку проекта'
          : 'Выбрать папку проекта'
      "
      @click="emit('chooseDirectory')"
    >
      <Icon :name="IconNameEnum.folder" />
      <span>{{ directoryLabel }}</span>
    </Button>
    <div
      v-on-click-outside.bubble="close"
      class="ai-composer-settings__model"
      @keydown.esc.stop="backOrClose"
    >
      <Button
        class="ai-assistant__response-trigger ai-composer-settings__trigger"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        :aria-label="`Модель и уровень рассуждения, ${modelLabel}, ${effortLabel}`"
        :title="modelLabel"
        aria-haspopup="dialog"
        :aria-expanded="isOpen"
        @click.stop="toggle"
      >
        <span>{{ modelLabel }}</span>
        <span class="ai-composer-settings__effort" :title="effortLabel">{{
          effortLabel
        }}</span>
      </Button>
      <div
        v-if="isOpen"
        class="ai-assistant__response-menu ai-composer-settings__menu"
        role="dialog"
        :aria-label="
          showModels ? 'Выбор модели' : 'Модель и уровень рассуждения'
        "
        :aria-busy="props.pending"
      >
        <div
          v-if="props.modelsLoading || props.modelsError"
          class="ai-composer-settings__model-state"
        >
          <p v-if="props.modelsLoading" role="status">
            Загружаю список моделей…
          </p>
          <template v-else>
            <p role="alert">{{ props.modelsError }}</p>
            <button type="button" @click="emit('retryModels')">
              Повторить
            </button>
          </template>
        </div>
        <div v-else-if="showModels" class="ai-composer-settings__choices">
          <header class="ai-composer-settings__choices-header">
            <button
              ref="backButton"
              type="button"
              aria-label="Назад к уровню рассуждения"
              @click="showEffort"
            >
              <Icon :name="IconNameEnum.arrowLeft" aria-hidden="true" />
            </button>
            <span>Выбор модели</span>
          </header>
          <button
            v-for="choice in props.models"
            :key="choice.value"
            type="button"
            :aria-pressed="props.model === choice.value"
            :disabled="props.pending"
            @click="selectModel(choice.value)"
          >
            <span>{{ choice.name }}</span>
            <Icon
              v-if="props.model === choice.value"
              :name="IconNameEnum.checked"
              aria-hidden="true"
            />
          </button>
        </div>
        <div v-else class="ai-composer-settings__levels">
          <span aria-live="polite">{{
            props.efforts[visibleIndex]?.name || effortLabel
          }}</span>
          <button
            ref="pickerButton"
            type="button"
            class="ai-composer-settings__picker"
            :aria-label="`Выбрать модель, ${modelLabel}`"
            :disabled="props.pending || !props.models.length"
            @click="openModels"
          >
            <span>{{ modelLabel }}</span>
            <Icon :name="IconNameEnum.chevronRight" aria-hidden="true" />
          </button>
          <div class="ai-composer-settings__track">
            <Range
              class="ai-composer-settings__slider"
              :model-value="visibleIndex"
              :max="Math.max(props.efforts.length - 1, 1)"
              :step="1"
              :disabled="props.efforts.length < 2"
              :aria-disabled="props.pending || undefined"
              :aria-valuetext="props.efforts[visibleIndex]?.name || effortLabel"
              aria-label="Уровень рассуждения"
              @input.capture="previewEffort"
              @change="selectEffort"
            />
            <div
              v-if="props.efforts.length > 1"
              class="ai-composer-settings__steps"
              aria-hidden="true"
            >
              <span
                v-for="(choice, index) in props.efforts"
                :key="choice.value"
                :class="{
                  'ai-composer-settings__step--current': index === visibleIndex
                }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Range,
  SizesEnum
} from '@pksep/yui';
import { vOnClickOutside } from '@vueuse/components';
import { computed, nextTick, ref } from 'vue';
import type { AgentChoice } from '../../composables/useDesktopAgentChats';

const props = defineProps<{
  project?: { directory: string };
  model: string;
  effort: string;
  models: AgentChoice[];
  efforts: AgentChoice[];
  applyModel: (model: string) => Promise<void>;
  applyEffort: (effort: string) => Promise<void>;
  directoryPending?: boolean;
  pending?: boolean;
  modelsLoading?: boolean;
  modelsError?: string;
}>();

const emit = defineEmits<{
  chooseDirectory: [];
  open: [];
  retryModels: [];
  error: [error: unknown];
}>();
const isOpen = ref(false);
const showModels = ref(false);
const savingEffort = ref(false);
const hoveredIndex = ref<number | null>(null);
const backButton = ref<HTMLButtonElement>();
const pickerButton = ref<HTMLButtonElement>();
const directoryLabel = computed(
  () =>
    props.project?.directory.split(/[\\/]/).filter(Boolean).at(-1) ||
    'Выбрать папку'
);
const modelLabel = computed(
  () =>
    props.models.find(choice => choice.value === props.model)?.name ??
    (props.model || 'Модель ИИ')
);
const effortLabel = computed(
  () =>
    props.efforts.find(choice => choice.value === props.effort)?.name ??
    'Обычный'
);
const visibleIndex = computed(
  () =>
    hoveredIndex.value ??
    Math.max(
      0,
      props.efforts.findIndex(choice => choice.value === props.effort)
    )
);

function close(): void {
  isOpen.value = false;
  showModels.value = false;
  hoveredIndex.value = null;
}

function toggle(): void {
  if (isOpen.value) close();
  else {
    isOpen.value = true;
    emit('open');
  }
}

async function openModels(): Promise<void> {
  showModels.value = true;
  await nextTick();
  backButton.value?.focus();
}

async function showEffort(): Promise<void> {
  showModels.value = false;
  await nextTick();
  pickerButton.value?.focus();
}

function backOrClose(): void {
  if (showModels.value) void showEffort();
  else close();
}

async function selectModel(value: string): Promise<void> {
  try {
    await props.applyModel(value);
    if (isOpen.value) await showEffort();
  } catch (error) {
    emit('error', error);
  }
}

function previewEffort(event: Event): void {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  if (props.pending || savingEffort.value) {
    input.value = String(visibleIndex.value);
    return;
  }
  hoveredIndex.value = Number(input.value);
}

async function selectEffort(event: Event): Promise<void> {
  if (
    !(event.target instanceof HTMLInputElement) ||
    props.pending ||
    savingEffort.value
  )
    return;
  const choice = props.efforts[Number(event.target.value)];
  if (!choice) return;

  savingEffort.value = true;
  try {
    await props.applyEffort(choice.value);
  } catch (error) {
    emit('error', error);
  } finally {
    savingEffort.value = false;
    hoveredIndex.value = null;
  }
}

defineExpose({ close });
</script>

<style scoped>
.ai-composer-settings.ai-assistant__editor {
  position: relative;
  width: auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 5px 8px;
  margin: 0 20px -9px;
  padding: 5px 10px 13px;
  border: 0.5px solid var(--border-table);
  border-bottom: 0;
  border-radius: 14px 14px 0 0;
  background: var(--surface-overlay);
}

.ai-composer-settings button.ai-composer-settings__folder {
  width: max-content;
  max-width: min(100%, 218px);
  min-width: 0;
  margin: 0;
}

.ai-composer-settings__folder span,
.ai-composer-settings__trigger > span:first-child,
.ai-composer-settings__effort {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-composer-settings__model {
  min-width: 0;
  max-width: 100%;
  margin-inline-start: auto;
}

.ai-composer-settings__model button.ai-composer-settings__trigger {
  width: 100%;
  height: 32px;
  min-width: 0;
  min-height: 32px;
  max-width: 100%;
  justify-content: flex-end;
  gap: 8px;
  padding-inline: 5px;
}

.ai-composer-settings__effort {
  color: var(--text-secondary);
  font-size: 12px;
}

.ai-composer-settings__menu {
  right: 10px;
  width: min(336px, calc(100% - 20px));
  min-width: 0;
  max-height: min(46vh, 380px);
  overflow-y: auto;
}

@media (max-width: 768px) {
  .ai-composer-settings.ai-assistant__editor {
    margin-inline: 10px;
  }
}

.ai-composer-settings__model-state {
  padding: 6px 4px;
  font-size: 14px;
  line-height: 1.4;
}

.ai-composer-settings__model-state p {
  margin: 0;
  line-height: inherit;
}

.ai-composer-settings__choices {
  display: grid;
  gap: 2px;
}

.ai-composer-settings__choices button {
  justify-content: space-between;
  min-height: 32px;
  font-size: 14px;
}

.ai-composer-settings__choices button[aria-pressed='true'] {
  color: var(--text-brand);
  background: var(--action-secondary-pressed-bg);
}

.ai-composer-settings__choices button :deep(svg) {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.ai-composer-settings__choices-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}

.ai-composer-settings__choices-header button {
  width: 30px;
  justify-content: center;
}

.ai-composer-settings__levels {
  display: grid;
  gap: 6px;
  padding: 8px 0 7px;
  text-align: center;
}

.ai-composer-settings__levels > span {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.ai-composer-settings__levels button.ai-composer-settings__picker {
  justify-self: center;
  width: auto;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
}

.ai-composer-settings__picker :deep(svg) {
  width: 12px;
  height: 12px;
  flex: 0 0 12px;
}

.ai-composer-settings__track {
  position: relative;
  margin-top: 8px;
}

.ai-composer-settings__track :deep(.ai-composer-settings__slider) {
  display: block;
  height: 26px;
  margin: 0;
  border-radius: 13px;
  --range-width-thumb: 28px;
  --range-track-color: color-mix(
    in srgb,
    var(--text-secondary) 55%,
    var(--action-secondary-pressed-bg)
  );
}

.ai-composer-settings__track :deep(.ai-composer-settings__slider:disabled) {
  opacity: 0.5;
  cursor: default;
}

.ai-composer-settings__track
  :deep(.ai-composer-settings__slider::-webkit-slider-thumb) {
  background: var(--surface-overlay);
  border: 0;
  box-shadow: 0 1px 3px rgb(0 0 0 / 16%);
}

.ai-composer-settings__track
  :deep(.ai-composer-settings__slider::-moz-range-thumb) {
  background: var(--surface-overlay);
  border: 0;
  box-shadow: 0 1px 3px rgb(0 0 0 / 16%);
}

.ai-composer-settings__steps {
  position: absolute;
  inset: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
}

.ai-composer-settings__steps span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #fff;
}

.ai-composer-settings__step--current {
  visibility: hidden;
}
</style>
