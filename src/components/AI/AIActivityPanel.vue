<template>
  <section
    class="ai-activity-panel"
    aria-label="Фоновые задачи ИИ"
    data-testid="AI-ActivityPanel"
  >
    <button
      v-for="activity in visibleActivities"
      :key="activity.sessionId"
      type="button"
      class="ai-activity-panel__item"
      :aria-label="`${activity.title}. ${getStatusLabel(activity.status)}`"
      @click="emit('select', activity.sessionId)"
    >
      <span
        :class="[
          'ai-activity-panel__dot',
          `ai-activity-panel__dot--${activity.status}`
        ]"
        aria-hidden="true"
      ></span>
      <span class="ai-activity-panel__copy">
        <strong>{{ activity.title }}</strong>
        <small>{{ activity.description }}</small>
      </span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type {
  AiAssistantActivity,
  AiAssistantActivityStatus
} from '../../composables/useAiAssistant';

const props = defineProps<{
  activities: readonly AiAssistantActivity[];
}>();

const emit = defineEmits<{
  select: [sessionId: string];
}>();

const visibleActivities = computed(() => props.activities.slice(0, 5));

const getStatusLabel = (status: AiAssistantActivityStatus): string => {
  if (status === 'running') return 'Выполняется';
  if (status === 'success') return 'Успешно завершено';
  return 'Требуется внимание';
};
</script>
