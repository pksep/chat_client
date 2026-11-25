<template>
  <section
    class="ai-activity-panel"
    :aria-label="props.ariaLabel"
    :data-testid="props.dataTestid"
  >
    <button
      v-for="activity in visibleActivities"
      :key="activity.sessionId"
      type="button"
      class="ai-activity-panel__item"
      :aria-label="`${activity.title}. ${
        activity.statusLabel || getAiActivityStatusLabel(activity.status)
      }`"
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
        <span v-if="props.showStatus" class="ai-activity-panel__status">
          {{
            activity.statusLabel || getAiActivityStatusLabel(activity.status)
          }}
        </span>
        <small>{{ activity.description }}</small>
      </span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import {
  getAiActivityStatusLabel,
  type AiAssistantActivity
} from '../../composables/useAiAssistant';

type ActivityPanelItem = AiAssistantActivity & {
  statusLabel?: string;
};

const props = withDefaults(
  defineProps<{
    activities: readonly ActivityPanelItem[];
    ariaLabel?: string;
    dataTestid?: string;
    showStatus?: boolean;
  }>(),
  {
    ariaLabel: 'Фоновые задачи ИИ',
    dataTestid: 'AI-ActivityPanel',
    showStatus: false
  }
);

const emit = defineEmits<{
  select: [sessionId: string];
}>();

const visibleActivities = computed(() => props.activities.slice(0, 5));
</script>
