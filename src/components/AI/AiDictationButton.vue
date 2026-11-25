<template>
  <Popover
    v-if="failure && !phase"
    :is-show="open"
    :class="{ 'mobile-buttons': mobile }"
    class="dictation-error"
    translate-y="calc(-100% - 44px)"
    @close="close"
  >
    <template #trigger>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.small"
        class="toolbar-button ai-assistant__dictation-button"
        aria-label="Ошибка диктовки"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :aria-description="failure.message"
        @pointerenter="show"
        @pointerleave="scheduleClose"
        @focus="show"
        @blur="scheduleClose"
        @click.stop="focusActions"
        @keydown.esc.stop="close"
      >
        <ErrorIcon aria-hidden="true" />
      </Button>
    </template>
    <div
      class="dictation-error__hint"
      role="dialog"
      aria-label="Ошибка диктовки"
      @pointerenter="show"
      @pointerleave="scheduleClose"
      @focusin="show"
      @focusout="scheduleClose"
      @keydown.esc.stop="returnToButton"
      @click.stop
    >
      <p>{{ failure.message }}</p>
      <div class="dictation-error__actions">
        <button ref="copyButton" type="button" @click="copy">
          <CopyIcon aria-hidden="true" />
          {{
            copied
              ? 'Скопировано'
              : failure.text
                ? 'Скопировать текст'
                : 'Скопировать ошибку'
          }}
        </button>
        <button type="button" :disabled="disabled" @click="retry">
          Начать заново
        </button>
      </div>
      <p v-if="copyFailed" role="alert">
        Не удалось скопировать. Попробуйте ещё раз.
      </p>
    </div>
  </Popover>
  <Button
    v-else
    :type="ButtonTypeEnum.primary"
    :size="SizesEnum.small"
    :class="{ 'mobile-buttons': mobile }"
    class="toolbar-button ai-assistant__dictation-button"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="phase === 'recording'"
    :aria-busy="busy"
    :data-dictation-phase="phase"
    :title="label"
    @click.stop="emit('toggle')"
  >
    <span v-if="busy" class="dictation-spinner" aria-hidden="true"></span>
    <span
      v-else-if="phase === 'recording'"
      class="ai-assistant__stop-square"
      aria-hidden="true"
    ></span>
    <MicIcon v-else />
  </Button>
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, Popover, SizesEnum } from '@pksep/yui';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type {
  DictationFailure,
  DictationPhase
} from '../../services/dictation';
import { copyTextToClipboard } from '../../utils/copyTextToClipboard';
import MicIcon from '../CallModal/UI/MicIcon.vue';
import CopyIcon from '../UI/CopyIcon.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';

const props = defineProps<{
  mobile?: boolean;
  disabled: boolean;
  label: string;
  phase?: DictationPhase;
  failure?: DictationFailure;
}>();
const emit = defineEmits<{ toggle: [] }>();
const busy = computed(() => !!props.phase && props.phase !== 'recording');
const open = ref(false);
const copied = ref(false);
const copyFailed = ref(false);
const copyButton = ref<HTMLButtonElement>();
let trigger: HTMLElement | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;

function show(): void {
  clearTimeout(closeTimer);
  open.value = true;
}

function close(): void {
  clearTimeout(closeTimer);
  open.value = false;
  copied.value = false;
  copyFailed.value = false;
}

function scheduleClose(): void {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(close, 250);
}

async function focusActions(event: MouseEvent): Promise<void> {
  if (event.currentTarget instanceof HTMLElement) trigger = event.currentTarget;
  show();
  await nextTick();
  copyButton.value?.focus();
}

function returnToButton(): void {
  trigger?.focus();
  close();
}

async function copy(): Promise<void> {
  if (!props.failure) return;

  try {
    await copyTextToClipboard(props.failure.text || props.failure.message);
    copied.value = true;
    copyFailed.value = false;
  } catch {
    copyFailed.value = true;
  }
}

function retry(): void {
  close();
  emit('toggle');
}

watch([() => props.failure, () => props.phase], close);
onBeforeUnmount(() => clearTimeout(closeTimer));
</script>

<style scoped>
.dictation-error.mobile-buttons {
  margin-left: auto;
}

.dictation-error__hint {
  display: grid;
  gap: 8px;
  max-width: min(280px, calc(100vw - 24px));
  padding: 10px 12px;
  background: var(--tooltip-neutral-bg);
  color: var(--text-white);
  font-size: 14px;
  line-height: 1.4;
}

.dictation-error__hint p {
  margin: 0;
  overflow-wrap: anywhere;
}

.dictation-error__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.dictation-error__actions button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.dictation-error__actions button:disabled {
  cursor: default;
  opacity: 0.5;
}

.dictation-error__actions svg {
  width: 14px;
  height: 14px;
}

.dictation-spinner {
  box-sizing: border-box;
  width: 16px;
  height: 16px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: dictation-spin 0.85s linear infinite;
}

@keyframes dictation-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dictation-spinner {
    animation: none;
  }
}
</style>
