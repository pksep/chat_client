<template>
  <section
    class="ai-action-pipeline"
    data-testid="AI-ActionPipeline"
    :aria-label="task.title"
  >
    <ol class="ai-action-pipeline__steps">
      <li
        v-for="(step, index) in task.steps"
        :key="step.key"
        class="ai-action-pipeline__step"
        :data-step="step.key"
        :data-status="step.status"
        :aria-label="`${index + 1}. ${step.title}. ${statusLabels[step.status]}`"
        :aria-current="isRunning(step) ? 'step' : undefined"
      >
        <span
          class="ai-action-pipeline__indicator"
          :class="{ 'ai-action-pipeline__indicator--running': isRunning(step) }"
          :data-testid="`AI-ActionPipeline-Status-${step.key}`"
        >
          <Badges
            class="ai-action-pipeline__number"
            :text="String(index + 1)"
            :type="badgeTypes[step.status]"
            :disabled="true"
            :data-testid="`AI-ActionPipeline-Number-${step.key}`"
            aria-hidden="true"
          />
          <span
            v-if="isRunning(step)"
            class="ai-action-pipeline__progress"
            aria-hidden="true"
          />
        </span>
        <span class="ai-action-pipeline__copy">{{ step.title }}</span>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { Badges, BadgesTypeEnum } from '@pksep/yui';
import type { AiActionTask } from '../../services/aiActionTasks';

defineProps<{
  task: AiActionTask;
}>();
type Step = AiActionTask['steps'][number];
const statusLabels: Record<Step['status'], string> = {
  pending: 'Ожидает выполнения',
  running: 'Выполняется',
  verifying: 'Проверяю результат',
  completed: 'Выполнено и проверено',
  failed: 'Не выполнено',
  uncertain: 'Результат требует проверки',
  cancelled: 'Отменено',
  blocked: 'Ожидает предыдущий шаг',
  waiting_approval: 'Ожидает подтверждения'
};
const badgeTypes: Record<Step['status'], BadgesTypeEnum> = {
  pending: BadgesTypeEnum.default,
  running: BadgesTypeEnum.blue,
  verifying: BadgesTypeEnum.blue,
  completed: BadgesTypeEnum.green,
  failed: BadgesTypeEnum.red,
  uncertain: BadgesTypeEnum.orange,
  cancelled: BadgesTypeEnum.disabled,
  blocked: BadgesTypeEnum.default,
  waiting_approval: BadgesTypeEnum.blue
};
const isRunning = (step: Step) =>
  ['running', 'verifying'].includes(step.status);
</script>

<style scoped>
.ai-action-pipeline {
  align-self: flex-start;
  box-sizing: border-box;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  margin-top: 8px;
  padding: 0;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}
.ai-action-pipeline__steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.ai-action-pipeline__step {
  position: relative;
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  min-width: 0;
}
.ai-action-pipeline__step:not(:last-child)::before {
  content: '';
  position: absolute;
  top: 28px;
  bottom: -8px;
  left: 11.5px;
  width: 1px;
  background: var(--border-table);
  pointer-events: none;
}
.ai-action-pipeline__indicator {
  position: relative;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  width: 24px;
  height: 24px;
}
.ai-action-pipeline__number {
  cursor: default;
}
.ai-action-pipeline__number :deep(.badges-text) {
  box-sizing: border-box;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 50%;
  font-variant-numeric: tabular-nums;
}
.ai-action-pipeline__indicator--running :deep(.badges-text) {
  width: 20px;
  height: 20px;
}
.ai-action-pipeline__progress {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border-radius: 50%;
  pointer-events: none;
}
.ai-action-pipeline__copy {
  min-width: 0;
  font-size: 14px;
  line-height: 24px;
  cursor: text;
  -webkit-user-select: text;
  user-select: text;
}
</style>
