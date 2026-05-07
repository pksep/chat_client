<template>
  <span class="typing-indicator" :data-testid="props.dataTestid">
    <span class="typing-indicator__label">{{ props.label }}</span>
    <span class="typing-indicator__dots" aria-hidden="true">
      <span></span>
      <span></span>
      <span></span>
    </span>
  </span>
</template>

<script setup lang="ts">
interface Props {
  label: string;
  dataTestid?: string;
}

const props = withDefaults(defineProps<Props>(), {
  dataTestid: 'TypingIndicator'
});
</script>

<style scoped>
.typing-indicator {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
  color: inherit;
}

.typing-indicator__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.typing-indicator__dots {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.typing-indicator__dots span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.35;
  animation: typing-indicator-bounce 1.2s infinite ease-in-out;
}

.typing-indicator__dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.typing-indicator__dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes typing-indicator-bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }

  40% {
    transform: translateY(-2px);
    opacity: 1;
  }
}
</style>
