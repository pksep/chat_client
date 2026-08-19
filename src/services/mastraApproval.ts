export interface PendingToolApproval {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export type ApprovalDecision = 'approve' | 'decline' | null;

const APPROVE_COMMANDS = new Set([
  'подтверждаю',
  'подтвердить',
  'approve',
  'confirm'
]);

const DECLINE_COMMANDS = new Set(['отмена', 'отменить', 'cancel', 'decline']);

export const getApprovalDecision = (input: string): ApprovalDecision => {
  const normalizedInput = input
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:nbsp|#160);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ru-RU');

  if (APPROVE_COMMANDS.has(normalizedInput)) return 'approve';
  if (DECLINE_COMMANDS.has(normalizedInput)) return 'decline';

  return null;
};

const formatValue = (value: unknown, fallback: string) => {
  const formattedValue = String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();

  return formattedValue.slice(0, 160) || fallback;
};

export const formatApprovalMessage = (approval: PendingToolApproval) => {
  if (approval.toolName === 'board_actions_tasks_create') {
    const title = formatValue(approval.args.title, 'без названия');
    const columnId = formatValue(approval.args.columnId, 'не указана');

    return `Подтвердите создание задачи «${title}» в колонке №${columnId}. Ответьте «подтверждаю» или «отмена».`;
  }

  return 'Подтвердите выполнение запрошенного действия. Ответьте «подтверждаю» или «отмена».';
};
