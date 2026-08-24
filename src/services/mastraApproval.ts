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

const formatList = (value: unknown, fallback: string) => {
  if (!Array.isArray(value) || value.length === 0) return fallback;

  return value
    .slice(0, 20)
    .map(item => `«${formatValue(item, fallback)}»`)
    .join(', ');
};

const formatChanges = (
  args: Record<string, unknown>,
  fields: Array<[string, string, (value: unknown) => string | null]>
) =>
  fields
    .filter(([key]) => args[key] !== undefined)
    .map(([key, label, formatter]) => {
      const value = formatter(args[key]);
      return value ? `${label} — ${value}` : label;
    })
    .join('; ');

const quotedValue = (value: unknown) => `«${formatValue(value, 'не указано')}»`;

const dateValue = (value: unknown) => formatDate(value);

const priorityValue = (value: unknown) => {
  const labels: Record<string, string> = {
    '': 'без приоритета',
    low: 'низкий',
    medium: 'средний',
    high: 'высокий',
    urgent: 'срочный'
  };
  return labels[String(value)] || formatValue(value, 'не указан');
};

const approvalStatusValue = (value: unknown) => {
  const labels: Record<string, string> = {
    '': 'не требуется',
    yes: 'согласовано',
    no: 'не согласовано'
  };
  return labels[String(value)] || formatValue(value, 'не указан');
};

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  erp_actions_erp_detail_create_and_add_to_cbed:
    'создание детали и изменение спецификации сборки',
  erp_actions_erp_detail_archive: 'перенос детали в архив',
  board_actions_projects_create: 'создание проекта',
  board_actions_projects_update: 'изменение проекта',
  board_actions_project_members_update: 'изменение участников проекта',
  board_actions_projects_favorite_set: 'изменение избранного',
  board_actions_projects_reorder: 'изменение порядка проектов',
  board_actions_projects_delete: 'удаление проекта',
  board_actions_project_tags_create: 'создание тега',
  board_actions_project_tags_update: 'изменение тега',
  board_actions_project_tags_delete: 'удаление тега',
  board_actions_boards_create: 'создание доски',
  board_actions_boards_update: 'изменение доски',
  board_actions_boards_reorder: 'изменение порядка досок',
  board_actions_boards_delete: 'удаление доски',
  board_actions_columns_create: 'создание колонки',
  board_actions_columns_update: 'изменение колонки',
  board_actions_columns_reorder: 'изменение порядка колонок',
  board_actions_columns_delete: 'удаление колонки',
  board_actions_tasks_create: 'создание задачи',
  board_actions_tasks_update: 'изменение задачи',
  board_actions_tasks_move: 'перемещение задачи',
  board_actions_tasks_delete: 'удаление задачи',
  board_actions_subtasks_create: 'создание подзадачи',
  board_actions_task_comments_create: 'добавление комментария'
};

const buildApprovalQuestion = (approval: PendingToolApproval): string => {
  const { args, toolName } = approval;
  const projectTitle = quotedValue(args.projectTitle);
  const boardTitle = quotedValue(args.boardTitle);
  const columnTitle = quotedValue(args.columnTitle);
  const taskTitle = quotedValue(args.taskTitle);

  switch (toolName) {
    case 'erp_actions_erp_detail_create_and_add_to_cbed': {
      const assemblyDesignation = args.assemblyDesignation
        ? ` с обозначением ${quotedValue(args.assemblyDesignation)}`
        : '';
      return `Создать деталь ${quotedValue(args.detailName)} с обозначением ${quotedValue(args.detailDesignation)} и добавить её в спецификацию сборки ${quotedValue(args.assemblyName)}${assemblyDesignation} в количестве ${formatValue(args.quantity, 'не указано')} шт.?`;
    }
    case 'erp_actions_erp_detail_archive': {
      const designation = args.detailDesignation
        ? ` с обозначением ${quotedValue(args.detailDesignation)}`
        : '';
      return `Перенести деталь ${quotedValue(args.detailName)}${designation} в архив? Связанные спецификации, комплекты и металлообработка будут актуализированы.`;
    }
    case 'board_actions_projects_create': {
      const members = Array.isArray(args.memberNames)
        ? ` Участники: ${formatList(args.memberNames, 'не указан')}.`
        : '';
      return `Создать проект ${quotedValue(args.title)} с префиксом ${quotedValue(args.prefix)}?${members}`;
    }
    case 'board_actions_projects_update': {
      const changes = formatChanges(args, [
        ['title', 'новое название', quotedValue],
        ['description', 'новое описание', quotedValue]
      ]);
      return `Изменить проект ${projectTitle}: ${changes}?`;
    }
    case 'board_actions_project_members_update':
      return `Заменить участников проекта ${projectTitle}: ${formatList(args.memberNames, 'без участников')}?`;
    case 'board_actions_projects_favorite_set':
      return args.isFavorite
        ? `Добавить проект ${projectTitle} в избранное?`
        : `Убрать проект ${projectTitle} из избранного?`;
    case 'board_actions_projects_reorder':
      return `Установить порядок проектов: ${formatList(args.projectTitles, 'не указан')}?`;
    case 'board_actions_projects_delete':
      return `Удалить проект ${projectTitle}?`;
    case 'board_actions_project_tags_create':
      return `Создать тег ${quotedValue(args.label)} в проекте ${projectTitle}?`;
    case 'board_actions_project_tags_update': {
      const changes = formatChanges(args, [
        ['label', 'новое название', quotedValue],
        ['color', 'изменить цвет', () => null],
        ['description', 'новое описание', quotedValue]
      ]);
      return `Изменить тег ${quotedValue(args.tagLabel)} в проекте ${projectTitle}: ${changes}?`;
    }
    case 'board_actions_project_tags_delete':
      return `Удалить тег ${quotedValue(args.tagLabel)} из проекта ${projectTitle}?`;
    case 'board_actions_boards_create': {
      const period = formatChanges(args, [
        ['startDate', 'начало', dateValue],
        ['endDate', 'окончание', dateValue]
      ]);
      return `Создать доску ${quotedValue(args.title)} в проекте ${projectTitle}${period ? `, ${period}` : ''}?`;
    }
    case 'board_actions_boards_update': {
      const changes = formatChanges(args, [
        ['title', 'новое название', quotedValue],
        ['startDate', 'начало', dateValue],
        ['endDate', 'окончание', dateValue]
      ]);
      return `Изменить доску ${boardTitle}: ${changes}?`;
    }
    case 'board_actions_boards_reorder':
      return `Установить порядок досок проекта ${projectTitle}: ${formatList(args.boardTitles, 'не указан')}?`;
    case 'board_actions_boards_delete':
      return `Удалить доску ${boardTitle}?`;
    case 'board_actions_columns_create':
      return `Создать колонку ${quotedValue(args.title)} на доске ${boardTitle}?`;
    case 'board_actions_columns_update': {
      const changes = formatChanges(args, [
        ['title', 'новое название', quotedValue],
        ['color', 'изменить цвет', () => null]
      ]);
      return `Изменить колонку ${columnTitle}: ${changes}?`;
    }
    case 'board_actions_columns_reorder':
      return `Установить порядок колонок доски ${boardTitle}: ${formatList(args.columnTitles, 'не указан')}?`;
    case 'board_actions_columns_delete':
      return `Удалить колонку ${columnTitle}?`;
    case 'board_actions_tasks_create': {
      const changes = formatChanges(args, [
        ['dueDate', 'срок', dateValue],
        ['priority', 'приоритет', priorityValue]
      ]);
      const assignees = Array.isArray(args.assigneeNames)
        ? ` Исполнители: ${formatList(args.assigneeNames, 'не указаны')}.`
        : '';
      const tags = Array.isArray(args.tagLabels)
        ? ` Теги: ${formatList(args.tagLabels, 'не указаны')}.`
        : '';
      return `Создать задачу ${quotedValue(args.title)} в колонке ${columnTitle}${changes ? `, ${changes}` : ''}?${assignees}${tags}`;
    }
    case 'board_actions_subtasks_create':
      return `Создать подзадачу ${quotedValue(args.title)} у задачи ${quotedValue(args.parentTaskTitle)}?`;
    case 'board_actions_tasks_update': {
      const changes = formatChanges(args, [
        ['title', 'новое название', quotedValue],
        ['description', 'новое описание', quotedValue],
        ['dueDate', 'срок', dateValue],
        ['priority', 'приоритет', priorityValue],
        ['approvalStatus', 'согласование', approvalStatusValue],
        [
          'assigneeIds',
          'исполнители',
          () => formatList(args.assigneeNames, 'не указаны')
        ],
        ['tagIds', 'теги', () => formatList(args.tagLabels, 'не указаны')],
        ['parentTaskId', 'сделать самостоятельной задачей', () => null]
      ]);
      return `Изменить задачу ${taskTitle}: ${changes}?`;
    }
    case 'board_actions_tasks_move': {
      const position =
        typeof args.order === 'number' ? ` на позицию ${args.order + 1}` : '';
      return `Переместить задачу ${taskTitle} в колонку ${columnTitle}${position}?`;
    }
    case 'board_actions_tasks_delete':
      return `Удалить задачу ${taskTitle}?`;
    case 'board_actions_task_comments_create':
      return `Добавить к задаче ${taskTitle} комментарий ${quotedValue(args.content)}?`;
    default: {
      const actionLabel =
        APPROVAL_ACTION_LABELS[toolName] || 'выполнение действия';
      const title = args.title ? ` ${quotedValue(args.title)}` : '';
      return `Подтвердите ${actionLabel}${title}.`;
    }
  }
};

export const formatApprovalMessage = (approval: PendingToolApproval) =>
  `${buildApprovalQuestion(approval)} Ответьте «подтверждаю» или «отмена».`;
