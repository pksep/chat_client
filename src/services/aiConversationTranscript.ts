import { z } from 'zod';
import { aiActionTaskSchema, type AiActionTask } from './aiActionTaskContract';
import { aiStoredAttachmentSchema } from './aiAttachmentReferences';
import { AI_MAX_ATTACHMENTS } from './aiAttachmentLimits';

const identifier = z.string().min(1).max(256);
const position = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const quoteSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(100_000)
  })
  .strict();
export const aiMessagePresentationSchema = z
  .object({
    displayText: z.string().min(1).max(100_000),
    replyTo: quoteSchema.optional()
  })
  .strict();
export type AiMessagePresentation = z.infer<typeof aiMessagePresentationSchema>;
const outputAttachment = z.object({
  id: identifier,
  name: z.string().min(1).max(255),
  size: position,
  contentType: z.string().min(1).max(255),
  path: z.string().min(1).max(4096),
  thumbnailPath: z.string().max(4096).nullable().optional()
});
const messageSchema = z
  .object({
    id: identifier,
    requestId: identifier,
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    presentationVersion: z.literal(1).optional(),
    modelContent: z.string().min(1).max(100_000).optional(),
    replyTo: quoteSchema.optional(),
    timestamp: position,
    pinned: z.boolean().optional(),
    pinVersion: position.optional(),
    attachments: z.array(aiStoredAttachmentSchema).max(AI_MAX_ATTACHMENTS),
    outputAttachments: z.array(outputAttachment),
    pendingToolApprovals: z.array(
      z.object({
        runId: identifier,
        toolCallId: identifier,
        toolName: identifier,
        args: z.record(z.unknown())
      })
    )
  })
  .strict()
  .refine(
    message =>
      !(
        message.modelContent ||
        message.replyTo ||
        message.presentationVersion
      ) ||
      (message.role === 'user' && message.presentationVersion === 1)
  );
export const aiConversationPageSchema = z
  .object({
    protocol: z.literal(1),
    generation: position,
    messages: z.array(messageSchema).max(100),
    tasks: z.array(aiActionTaskSchema).max(100),
    incompleteMessages: z
      .array(z.object({ id: identifier, requestId: identifier }).strict())
      .max(100),
    nextCursor: position.nullable()
  })
  .strict();
export type AiConversationPage = z.infer<typeof aiConversationPageSchema>;
export type AiTranscriptMessage = z.infer<typeof messageSchema>;
export type AiConversationPageQuery = {
  generation: number;
  after?: number;
  limit: number;
};

const invalidHistory = () =>
  new Error(
    'Не удалось проверить серверную переписку. Сообщения на экране не изменены; обновите чат.'
  );

/** Возвращает цельный проверенный снимок. Ошибка любой страницы не превращается в пустую или частичную историю. */
export async function loadAiConversationTranscript(
  fetchPage: (query: AiConversationPageQuery) => Promise<unknown>,
  generation: number,
  maxPages = 200
): Promise<Omit<AiConversationPage, 'nextCursor'>> {
  position.parse(generation);
  z.number().int().positive().max(200).parse(maxPages);
  let after = 0;
  const messages: AiTranscriptMessage[] = [];
  const messageIds = new Set<string>();
  const tasks = new Map<string, AiActionTask>();
  const incomplete = new Map<
    string,
    AiConversationPage['incompleteMessages'][number]
  >();
  for (let number = 0; number < maxPages; number += 1) {
    const parsed = aiConversationPageSchema.safeParse(
      await fetchPage({ generation, after, limit: 100 })
    );
    if (!parsed.success || parsed.data.generation !== generation)
      throw invalidHistory();
    const page = parsed.data;
    if (page.nextCursor !== null && page.nextCursor <= after)
      throw invalidHistory();
    for (const message of page.messages) {
      if (messageIds.has(message.id) || incomplete.has(message.id))
        throw invalidHistory();
      messageIds.add(message.id);
      messages.push(message);
    }
    for (const message of page.incompleteMessages) {
      if (messageIds.has(message.id) || incomplete.has(message.id))
        throw invalidHistory();
      incomplete.set(message.id, message);
    }
    for (const task of page.tasks) {
      const previous = tasks.get(task.id);
      if (previous && previous.requestId !== task.requestId)
        throw invalidHistory();
      if (!previous || task.version > previous.version)
        tasks.set(task.id, task);
    }
    if (page.nextCursor === null)
      return {
        protocol: 1,
        generation,
        messages,
        tasks: [...tasks.values()],
        incompleteMessages: [...incomplete.values()]
      };
    // Пустая отображаемая страница может содержать только служебные записи. Курсор обязан продвигаться.
    after = page.nextCursor;
  }
  throw new Error(
    'История слишком большая для одной загрузки. Сохранённые сообщения не изменены.'
  );
}
