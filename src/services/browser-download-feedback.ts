import { startOperationNotification } from '../composables/useNotifications';
import { triggerBrowserDownloads } from '../utils/media-download';

export const downloadBrowserFilesWithFeedback = async (
  files: { url: string; fileName: string }[]
): Promise<void> => {
  if (!files.length) return;
  const feedback = startOperationNotification('Начинаем скачивание…');
  try {
    await triggerBrowserDownloads(files);
    // Браузер не сообщает странице об окончании системного скачивания.
    feedback.success('Скачивание начато');
  } catch (error) {
    feedback.error(error);
  }
};
