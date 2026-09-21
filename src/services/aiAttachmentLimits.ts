// Контракт временных вложений chat_ai: число файлов и размер одного файла.
export const AI_MAX_ATTACHMENTS = 10;
export const AI_MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/** Проверяет весь набор до загрузки первого файла, не обрезая вложения молча. */
export const validateAiAttachments = (
  files: ReadonlyArray<{ name: string; size: number }>
): void => {
  if (files.length > AI_MAX_ATTACHMENTS) {
    throw new Error(
      `В одном сообщении можно прикрепить не более ${AI_MAX_ATTACHMENTS} файлов. Выбрано: ${files.length}. Уберите лишние файлы и отправьте сообщение снова.`
    );
  }
  const tooLarge = files.find(file => file.size > AI_MAX_ATTACHMENT_BYTES);
  if (tooLarge) {
    throw new Error(
      `Файл «${tooLarge.name}» превышает ограничение 50 МБ. Уменьшите размер файла или уберите его из сообщения.`
    );
  }
  if (files.some(file => !Number.isSafeInteger(file.size) || file.size <= 0)) {
    throw new Error(
      'Пустые файлы отправить нельзя. Уберите пустой файл или выберите файл с содержимым.'
    );
  }
  if (files.some(file => !file.name.trim() || file.name.trim().length > 255)) {
    throw new Error(
      'Название файла должно содержать от 1 до 255 символов. Переименуйте файл и прикрепите его заново.'
    );
  }
};
