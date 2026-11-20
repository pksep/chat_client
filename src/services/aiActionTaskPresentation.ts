import type { AiActionTask } from './aiActionTaskContract';

/** Озвучиваем только подтверждённое сервером состояние, без нового запуска ИИ. */
export function actionTaskVoiceReply(task: AiActionTask): string | null {
  if (task.status === 'waiting_approval')
    return `Подготовлено: ${task.title}. Нажмите «Подтвердить» в чате.`;
  if (task.status === 'completed') return `Выполнено: ${task.title}.`;
  if (task.status === 'needs_review')
    return 'Сервис ещё проверяет результат действия. Итог появится в чате.';
  if (task.status === 'failed' || task.status === 'partial') {
    const reason = actionTaskSummary(task);
    if (
      task.steps.length &&
      task.steps.every(step => step.status === 'cancelled')
    )
      return 'Действие отменено.';
    return `${task.completed ? `Выполнено шагов: ${task.completed} из ${task.steps.length}.` : 'Действие не выполнено.'} ${reason || 'Подробности в карточке действия.'}`;
  }

  return null;
}

/** Следим только за решениями, принятыми в текущем голосовом сеансе. */
export class VoiceActionFeedback {
  private readonly pending = new Map<string, string | undefined>();

  track(id: string): void {
    this.pending.set(id, undefined);
  }

  update(tasks: Iterable<AiActionTask>): string[] {
    const replies: string[] = [];
    for (const task of tasks) {
      if (!this.pending.has(task.id) || task.status === 'waiting_approval')
        continue;
      const reply = actionTaskVoiceReply(task);
      if (!reply || this.pending.get(task.id) === reply) continue;
      replies.push(reply);
      if (task.status === 'needs_review') this.pending.set(task.id, reply);
      else this.pending.delete(task.id);
    }

    return replies;
  }

  clear(): void {
    this.pending.clear();
  }
}

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
