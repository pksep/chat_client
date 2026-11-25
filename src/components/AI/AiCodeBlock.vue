<template>
  <div class="ai-code-block">
    <div class="ai-code-block__header">
      <span class="ai-code-block__language">{{ result.label }}</span>
      <button
        type="button"
        class="ai-code-block__copy"
        :aria-label="feedback || 'Копировать код'"
        :title="feedback || 'Копировать код'"
        @click.stop="copy"
      >
        <Icon
          :name="copied ? IconNameEnum.checked : IconNameEnum.copy"
          :width="12"
          :height="12"
          aria-hidden="true"
        />
      </button>
      <span class="ai-code-block__feedback" aria-live="polite">{{ feedback }}</span>
    </div>
    <pre
      :aria-label="result.label"
      tabindex="0"
    ><code v-if="result.html !== undefined" v-html="result.html" /><code v-else>{{ source }}</code></pre>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import { copyTextToClipboard } from '../../utils/copyTextToClipboard';
import type { AiCodeSnippet } from '../../utils/renderAiMarkdown';
import type { highlightAiCode } from '../../utils/highlightAiCode';

const props = defineProps<AiCodeSnippet>();
const highlight = shallowRef<typeof highlightAiCode>();
const result = computed<ReturnType<typeof highlightAiCode>>(
  () => highlight.value?.(props) ?? { label: props.language || 'Код' }
);
const feedback = ref('');
const copied = computed<boolean>(() => feedback.value === 'Скопировано');
let reset: ReturnType<typeof setTimeout> | undefined;
let mounted = true;

onMounted(async (): Promise<void> => {
  try {
    const module = await import('../../utils/highlightAiCode');
    if (mounted) highlight.value = module.highlightAiCode;
  } catch {
    // При недоступности модуля исходный код уже виден и доступен для копирования.
  }
});

onUnmounted(() => {
  mounted = false;
  clearTimeout(reset);
});

async function copy(): Promise<void> {
  try {
    await copyTextToClipboard(props.source);
    if (!mounted) return;
    feedback.value = 'Скопировано';
  } catch {
    if (!mounted) return;
    feedback.value = 'Не удалось скопировать';
  }
  clearTimeout(reset);
  reset = setTimeout(() => {
    feedback.value = '';
  }, 2200);
}
</script>
