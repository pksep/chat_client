/** Внешний аватар можно показать через img даже без разрешения CDN на fetch. */
export function directAvatarUrl(path: string): string | null {
  if (/^(blob:|data:|file:\/\/)/i.test(path)) return path;

  try {
    const url = new URL(path);

    if (url.protocol === 'https:' && !url.username && !url.password)
      return path;
  } catch {
    // Относительные пути продолжают использовать защищённый кеш файлов Чата.
  }

  return null;
}
