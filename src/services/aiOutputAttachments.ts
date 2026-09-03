export interface AiOutputAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
  path: string;
  thumbnailPath?: string | null;
}

const MAX_ATTACHMENTS_PER_EVENT = 20;

/** Извлекает доставленные AI-файлы из служебного результата инструмента Mastra. */
export const extractAiOutputAttachments = (
  payload: unknown
): AiOutputAttachment[] => {
  const result: AiOutputAttachment[] = [];
  const visited = new Set<object>();

  const visit = (value: unknown, depth: number): void => {
    if (depth > 6 || result.length >= MAX_ATTACHMENTS_PER_EVENT) return;
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);

    const record = value as Record<string, unknown>;
    if (Array.isArray(record.chatAttachments)) {
      for (const candidate of record.chatAttachments) {
        const attachment = normalizeAttachment(candidate);
        if (attachment) result.push(attachment);
      }
    }

    for (const nested of Object.values(record)) visit(nested, depth + 1);
  };

  visit(payload, 0);
  return result.slice(0, MAX_ATTACHMENTS_PER_EVENT);
};

const normalizeAttachment = (value: unknown): AiOutputAttachment | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const size = Number(record.size);
  if (
    typeof record.id !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.contentType !== 'string' ||
    typeof record.path !== 'string' ||
    !Number.isSafeInteger(size) ||
    size < 0
  ) {
    return null;
  }

  return {
    id: record.id,
    name: record.name,
    size,
    contentType: record.contentType,
    path: record.path,
    thumbnailPath:
      typeof record.thumbnailPath === 'string' ? record.thumbnailPath : null
  };
};
