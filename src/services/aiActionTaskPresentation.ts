import type { AiActionTask } from './aiActionTaskContract';

/** Статус показан цветом шага. Текст нужен только для причины отказа и решения. */
export function actionTaskSummary(task: AiActionTask): string {
  return task.steps
    .filter(
      step => step.status === 'failed' && (step.message || step.resolution)
    )
    .map(
      step =>
        `${step.title}: ${[step.message, step.resolution].filter(Boolean).join(' ')}`
    )
    .join('\n');
}
