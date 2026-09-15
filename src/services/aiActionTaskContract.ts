import { z } from 'zod';

export const aiActionTaskSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  title: z.string(),
  revision: z.number().int().positive(),
  version: z.number().int().positive(),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  approved: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  completed: z.number(),
  automaticVerification: z.boolean().optional(),
  status: z.enum([
    'completed',
    'running',
    'needs_review',
    'waiting_approval',
    'partial',
    'failed',
    'pending'
  ]),
  steps: z.array(
    z.object({
      key: z.string(),
      title: z.string(),
      status: z.enum([
        'pending',
        'running',
        'verifying',
        'completed',
        'failed',
        'uncertain',
        'cancelled',
        'blocked',
        'waiting_approval'
      ]),
      message: z.string().optional(),
      resolution: z.string().optional(),
      retryable: z.boolean().optional(),
      completedAt: z.number().optional(),
      dependencies: z.array(z.string()),
      details: z.object({
        toolName: z.string(),
        input: z.record(z.string(), z.unknown())
      })
    })
  )
});
export type AiActionTask = z.infer<typeof aiActionTaskSchema>;
