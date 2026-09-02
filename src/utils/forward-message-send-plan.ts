export interface IForwardMessageSendPlanItem {
  kind: 'forward' | 'text';
  text: string;
  forwardMessageId?: string;
  forwardBatchOrder: number;
}

export const buildForwardMessageSendPlan = (
  forwardMessageIds: string[],
  textParts: string[]
): IForwardMessageSendPlanItem[] => [
  ...forwardMessageIds.map((forwardMessageId, index) => ({
    kind: 'forward' as const,
    text: '',
    forwardMessageId,
    forwardBatchOrder: index
  })),
  ...textParts.map((text, index) => ({
    kind: 'text' as const,
    text,
    forwardBatchOrder: forwardMessageIds.length + index
  }))
];
