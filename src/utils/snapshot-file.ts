const COPY_CHUNK_SIZE = 4 * 1024 * 1024;

export const snapshotFile = async (file: File): Promise<File> => {
  const parts: Blob[] = [];
  // Обёртка new File([file]) сохраняет ссылку на временный файл камеры iOS.
  // Читаем байты до передачи редактору, ограничивая размер одного буфера.
  for (let start = 0; start < file.size; start += COPY_CHUNK_SIZE) {
    const end = Math.min(file.size, start + COPY_CHUNK_SIZE);
    const bytes = await file.slice(start, end).arrayBuffer();
    if (bytes.byteLength !== end - start) {
      throw new Error('Не удалось прочитать файл. Выберите его ещё раз.');
    }
    parts.push(new Blob([bytes]));
  }
  return new File(parts, file.name, {
    type: file.type,
    lastModified: file.lastModified
  });
};
