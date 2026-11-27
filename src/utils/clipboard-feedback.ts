import { startOperationNotification } from '../composables/useNotifications';

export const copyWithFeedback = async (
  copy: () => Promise<void>,
  success = 'Скопировано'
): Promise<boolean> => {
  const feedback = startOperationNotification('Копируем…');
  try {
    // Вызываем сразу, чтобы Clipboard API сохранил пользовательский жест WebKit.
    await copy();
    feedback.success(success);
    return true;
  } catch (error) {
    feedback.error(
      error instanceof Error ? error.message : 'Не удалось скопировать'
    );
    return false;
  }
};
