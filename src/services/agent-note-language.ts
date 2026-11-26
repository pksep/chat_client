const translations = new Map<string, string>();

export function noteKey(threadId: string, source: string): string {
  return JSON.stringify([threadId, source]);
}

export function cachedRussianNote(
  threadId: string,
  source: string
): string | undefined {
  return translations.get(noteKey(threadId, source));
}

export function rememberRussianNote(
  threadId: string,
  source: string,
  translation: string
): void {
  translations.set(noteKey(threadId, source), translation);
  const oldest = translations.keys().next();
  if (translations.size > 512 && !oldest.done)
    translations.delete(oldest.value);
}

/** Технические обозначения в русском пояснении сохраняются в оригинале. */
export function needsRussianTranslation(source: string): boolean {
  const prose = source
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/[\p{L}\d_./\\-]+\.[a-z\d]{1,12}\b/giu, ' ')
    .replace(/\b(?:SVG|PNG|JPEG|PDF|HTML|CSS|JSON|XML|API|UTF-8)\b/g, ' ');

  return prose.split(/[\n.!?]+/).some(line => {
    if (!/[а-яё]/i.test(line)) return /[a-z]/i.test(line);

    // В смешанной строке отличаем английскую фразу от названия вроде OpenAI Responses API.
    return (
      /\b[a-z]{2,}[\s*-]+[a-z]{2,}\b/.test(line) ||
      /\b(?:[A-Za-z]+ing|[Tt]he|[Ww]ill|[Tt]o|[Ff]or)\s+[A-Za-z]/.test(line)
    );
  });
}
