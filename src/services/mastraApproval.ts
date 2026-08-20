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

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
};

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

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, character => HTML_ENTITIES[character] || character);

const formatValue = (value: unknown, fallback: string) => {
  const formattedValue = String(value ?? fallback)
    .replace(/\s+/g, ' ')
    .trim();

  return escapeHtml(formattedValue.slice(0, 160) || fallback);
};

const formatDate = (value: unknown): string | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
};

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  board_actions_projects_create: 'создание проекта',
  board_actions_projects_update: 'изменение проекта',
  board_actions_boards_create: 'создание доски',
  board_actions_boards_update: 'изменение доски',
  board_actions_columns_create: 'создание колонки',
  board_actions_columns_update: 'изменение колонки',
  board_actions_columns_reorder: 'изменение порядка колонок',
  board_actions_tasks_update: 'изменение задачи',
  board_actions_tasks_move: 'перемещение задачи',
  board_actions_subtasks_create: 'создание подзадачи',
  board_actions_task_comments_create: 'добавление комментария'
};

export const formatApprovalMessage = (approval: PendingToolApproval) => {
  if (approval.toolName === 'board_actions_tasks_create') {
    const title = formatValue(approval.args.title, 'без названия');
    const columnTitle = formatValue(
      approval.args.columnTitle,
      'выбранная колонка'
    );
    const dueDate = formatDate(approval.args.dueDate);
    const dueDateText = dueDate ? `, срок — ${dueDate}` : '';

    return `Создать задачу «${title}» в колонке «${columnTitle}»${dueDateText}? Ответьте «подтверждаю» или «отмена».`;
  }

  const actionLabel =
    APPROVAL_ACTION_LABELS[approval.toolName] || 'выполнение действия';
  const title = approval.args.title
    ? ` «${formatValue(approval.args.title, '')}»`
    : '';

  return `Подтвердите ${actionLabel}${title}. Ответьте «подтверждаю» или «отмена».`;
};
