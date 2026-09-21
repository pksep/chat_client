/** Ввод сохранён либо решение передано исполнителю; это не подтверждение успеха ERP. */
export interface AiSubmissionResult {
  accepted: boolean;
  responseText: string | null;
}

export interface AiSubmissionObserver {
  accept: () => void;
  respond: (text: string | null) => void;
}

/** Результат принадлежит одному вызову; прежний ответ из общего массива не подставляется. */
export async function observeAiSubmission(
  action: (observer: AiSubmissionObserver) => Promise<void>,
  onAccepted?: () => void
): Promise<AiSubmissionResult> {
  const result: AiSubmissionResult = { accepted: false, responseText: null };
  await action({
    accept: () => {
      if (result.accepted) return;
      result.accepted = true;
      try {
        onAccepted?.();
      } catch (error) {
        // Сбой оформления редактора не прерывает уже сохранённое поручение.
        console.error(
          'Не удалось обновить редактор после сохранения сообщения:',
          error
        );
      }
    },
    respond: text => {
      result.responseText = result.accepted && text?.trim() ? text : null;
    }
  });
  return result;
}
