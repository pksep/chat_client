import { z } from 'zod';
import {
  AI_MAX_ATTACHMENTS,
  AI_MAX_ATTACHMENT_BYTES
} from './aiAttachmentLimits';

export const aiAttachmentReferenceSchema = z
  .object({
    attachmentId: z.string().uuid().optional(),
    contentHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    name: z.string().min(1).max(255),
    size: z.number().int().positive().max(AI_MAX_ATTACHMENT_BYTES),
    contentType: z.string().min(1).max(255),
    transferToken: z.string().min(32).max(4096),
    expiresAt: z.number().positive()
  })
  .refine(file => Boolean(file.attachmentId) === Boolean(file.contentHash));
export interface AiAttachmentReference {
  attachmentId?: string;
  contentHash?: string;
  name: string;
  size: number;
  contentType: string;
  transferToken: string;
  expiresAt: number;
}

/** История хранит идентичность файла, но не устаревающее право скачивания. */
export const aiStoredAttachmentSchema = aiAttachmentReferenceSchema
  .innerType()
  .omit({ transferToken: true, expiresAt: true })
  .required({ attachmentId: true, contentHash: true });
export type AiStoredAttachment = Required<
  z.infer<typeof aiStoredAttachmentSchema>
>;
export type AiMessageAttachment =
  | AiAttachmentReference
  | (AiStoredAttachment & {
      transferToken?: never;
      expiresAt?: never;
    });

/** Серверная история содержит описание исходника без токена; старые локальные ссылки тоже сохраняются. */
export function parseAiMessageAttachments(
  value: unknown
): AiMessageAttachment[] {
  const result = z
    .array(z.union([aiAttachmentReferenceSchema, aiStoredAttachmentSchema]))
    .max(AI_MAX_ATTACHMENTS)
    .safeParse(value);
  if (!result.success)
    throw new Error(
      'Не удалось проверить сохранённые вложения. Список файлов не изменён.'
    );
  return result.data as AiMessageAttachment[];
}

/** Проверяет весь набор без удаления отдельных элементов и перенумерации вложений. */
export function parseAiAttachmentReferences(
  value: unknown
): AiAttachmentReference[] {
  const result = aiAttachmentReferenceSchema
    .array()
    .max(AI_MAX_ATTACHMENTS)
    .safeParse(value);
  if (!result.success)
    throw new Error(
      'Не удалось проверить сохранённые вложения. Прикрепите нужные файлы заново. Выполненные действия сохраняются.'
    );
  // В проекте выключен strictNullChecks: обязательность полей проверена схемой выше.
  return result.data as AiAttachmentReference[];
}

/** Обновляет только доступ, не позволяя серверному ответу заменить файл или поменять его номер. */
export function mergeRefreshedAiAttachments(
  original: AiMessageAttachment[],
  response: unknown,
  now = Date.now()
): AiAttachmentReference[] {
  const refreshed = parseAiAttachmentReferences(response);
  const ids = [
    ...new Set(
      original.flatMap(file => (file.attachmentId ? [file.attachmentId] : []))
    )
  ];
  if (
    refreshed.length !== ids.length ||
    refreshed.some((file, index) => file.attachmentId !== ids[index])
  )
    throw new Error(
      'Не удалось обновить доступ ко всем вложениям. Список файлов сохранён; попробуйте ещё раз.'
    );
  const byId = new Map(refreshed.map(file => [file.attachmentId, file]));
  return original.map(file => {
    if (!file.attachmentId) {
      const legacy = parseAiAttachmentReferences([file])[0];
      if (legacy.expiresAt <= now)
        throw new Error(
          'Срок доступа к старому вложению истёк. Прикрепите его заново. Остальные файлы и выполненные действия сохраняются.'
        );
      return legacy;
    }
    const next = byId.get(file.attachmentId)!;
    if (
      next.contentHash !== file.contentHash ||
      next.name !== file.name ||
      next.size !== file.size ||
      next.contentType !== file.contentType ||
      next.expiresAt <= now
    )
      throw new Error(
        'Не удалось подтвердить неизменность вложения. Прикрепите нужный файл заново; выполненные действия сохраняются.'
      );
    return next;
  });
}
