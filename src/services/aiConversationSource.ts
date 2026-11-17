import { z } from 'zod';

export const aiConversationSourceSchema = z
  .object({
    threadId: z
      .string()
      .min(1)
      .max(128)
      .refine(value =>
        Array.from(value).every(
          character =>
            character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127
        )
      ),
    ownerId: z.string().min(1).max(128),
    organizationId: z.string().min(1).max(256),
    title: z.string().max(160).optional()
  })
  .strict();

export type AiConversationSource = z.infer<typeof aiConversationSourceSchema>;
