export interface PendingToolApproval {
  runId: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export type ApprovalDecision = 'approve' | 'decline' | null;

const STALE_APPROVAL_RESPONSE_PATTERNS = [
  /could not find an active or suspended run/iu,
  /could not find a suspended run/iu,
  /currently-suspended run/iu,
  /AGENT_SEND_TOOL_APPROVAL_NO_ACTIVE_THREAD_RUN/iu
];

/** Определяет, что подтверждение больше нельзя продолжить после завершения или перезапуска запуска Mastra. */
export const isStaleApprovalResponse = (payload: unknown): boolean => {
  const text =
    typeof payload === 'string'
      ? payload
      : (() => {
          try {
            return JSON.stringify(payload);
          } catch {
            return '';
          }
        })();

  return STALE_APPROVAL_RESPONSE_PATTERNS.some(pattern => pattern.test(text));
};

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
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
      return value ? `${label}: ${value}` : label;
    })
    .join('; ');

const quotedValue = (value: unknown) => `«${formatValue(value, 'не указано')}»`;

/** Формирует ссылку на ERP-сущность только из понятных пользователю полей. */
const entityReference = (
  name: unknown,
  designation: unknown,
  fallback: string
) => {
  const hasName = typeof name === 'string' && name.trim().length > 0;
  const hasDesignation =
    typeof designation === 'string' && designation.trim().length > 0;

  if (hasName && hasDesignation) {
    return `${quotedValue(name)} с обозначением ${quotedValue(designation)}`;
  }
  if (hasName) return quotedValue(name);
  if (hasDesignation) return `с обозначением ${quotedValue(designation)}`;
  return fallback;
};

/** Возвращает название родительской сущности в формулировке подтверждения. */
const specificationParentLabel = (value: unknown) => {
  if (value === 'product') return 'изделия';
  if (value === 'cbed') return 'сборочной единицы';
  if (value === 'detal') return 'детали';
  return 'сущности ERP';
};

/** Возвращает название раздела спецификации без внутренних ключей ERP. */
const specificationItemLabel = (value: unknown) => {
  if (value === 'listCbed') return 'сборочную единицу';
  if (value === 'listDetal') return 'деталь';
  if (value === 'listPokDet') return 'покупной материал';
  return 'материал';
};

const contentPreviewValue = (value: unknown) => {
  const plainText = String(value ?? '')
    .replace(/<\s*br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return plainText ? quotedValue(plainText) : 'пустое содержимое';
};

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
  erp_actions_erp_attachment_upload_and_attach:
    'создание документа ERP из вложения и его прикрепление',
  erp_actions_erp_detail_create_and_add_to_cbed:
    'создание детали и изменение спецификации сборки',
  erp_actions_erp_detail_archive: 'перенос детали в архив',
  erp_actions_erp_specification_item_add:
    'добавление позиции в спецификацию ERP',
  erp_actions_erp_specification_item_update:
    'изменение позиции спецификации ERP',
  erp_actions_erp_specification_item_move: 'изменение порядка спецификации ERP',
  erp_actions_erp_specification_item_remove:
    'удаление позиции из спецификации ERP',
  erp_actions_erp_entity_file_attach: 'прикрепление файла к сущности ERP',
  erp_actions_erp_entity_file_detach: 'открепление файла от сущности ERP',
  erp_actions_erp_entity_file_main_set: 'изменение главного файла ERP',
  erp_actions_erp_file_update: 'изменение данных файла ERP',
  erp_actions_erp_file_archive: 'перенос файла ERP в архив',
  erp_actions_erp_file_restore: 'восстановление файла ERP из архива',
  knowledge_actions_knowledge_document_create: 'создание элемента базы знаний',
  knowledge_actions_knowledge_document_update: 'изменение элемента базы знаний',
  knowledge_actions_knowledge_document_archive:
    'перенос элемента базы знаний в архив',
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
    case 'erp_actions_erp_specification_item_add': {
      const parent = entityReference(
        args.parentName,
        args.parentDesignation,
        'без указанного названия'
      );
      const item = entityReference(
        args.itemName,
        args.itemDesignation,
        'без названия'
      );
      const position = args.position
        ? ` на позицию ${formatValue(args.position, 'не указана')}`
        : '';
      return `Добавить ${specificationItemLabel(args.section)} ${item} в спецификацию ${specificationParentLabel(args.parentType)} ${parent} в количестве ${formatValue(args.quantity, 'не указано')}${position}?`;
    }
    case 'erp_actions_erp_specification_item_update': {
      const parent = entityReference(
        args.parentName,
        args.parentDesignation,
        'без указанного названия'
      );
      const item = entityReference(
        args.itemName,
        args.itemDesignation,
        'без названия'
      );
      const changes = [
        args.quantity !== undefined
          ? `количество: ${formatValue(args.quantity, 'не указано')}`
          : null,
        args.measureId !== undefined ? 'изменить единицу измерения' : null
      ]
        .filter(Boolean)
        .join('; ');
      return `Изменить ${specificationItemLabel(args.section)} ${item} в спецификации ${specificationParentLabel(args.parentType)} ${parent}: ${changes || 'указанные параметры'}?`;
    }
    case 'erp_actions_erp_specification_item_move': {
      const parent = entityReference(
        args.parentName,
        args.parentDesignation,
        'без указанного названия'
      );
      const item = entityReference(
        args.itemName,
        args.itemDesignation,
        'без названия'
      );
      return `Переместить ${specificationItemLabel(args.section)} ${item} на позицию ${formatValue(args.position, 'не указана')} в спецификации ${specificationParentLabel(args.parentType)} ${parent}?`;
    }
    case 'erp_actions_erp_specification_item_remove': {
      const parent = entityReference(
        args.parentName,
        args.parentDesignation,
        'без указанного названия'
      );
      const item = entityReference(
        args.itemName,
        args.itemDesignation,
        'без названия'
      );
      return `Убрать ${specificationItemLabel(args.section)} ${item} из спецификации ${specificationParentLabel(args.parentType)} ${parent}? Сама сущность останется в ERP.`;
    }
    case 'erp_actions_erp_attachment_upload_and_attach': {
      const main = args.makeMain
        ? ' Файл также получит общий для ERP признак «Главный» во всех своих привязках.'
        : '';
      const newVersion = args.newVersion
        ? ' Если активный файл с таким именем уже существует, будет создана новая версия.'
        : '';
      return `Создать в ERP документ из вложения ${quotedValue(args.attachmentName)} и прикрепить его к ${quotedValue(args.entityName)}?${main}${newVersion}`;
    }
    case 'erp_actions_erp_entity_file_attach': {
      const main = args.makeMain
        ? ' Файл также получит глобальный признак «Главный» во всех своих привязках.'
        : '';
      return `Прикрепить файл ${quotedValue(args.documentName)} к ${quotedValue(args.entityName)}?${main}`;
    }
    case 'erp_actions_erp_entity_file_detach':
      return `Открепить файл ${quotedValue(args.documentName)} от ${quotedValue(args.entityName)}? Сам файл останется в базе ERP.`;
    case 'erp_actions_erp_entity_file_main_set':
      return args.main
        ? `Установить для файла ${quotedValue(args.documentName)} глобальный признак «Главный»? Изменение будет действовать во всех привязках этого файла.`
        : `Снять у файла ${quotedValue(args.documentName)} глобальный признак «Главный»? Изменение будет действовать во всех привязках этого файла.`;
    case 'erp_actions_erp_file_update': {
      const changes = formatChanges(args, [
        ['name', 'новое название', quotedValue],
        ['type', 'новый тип', quotedValue],
        ['description', 'новое описание', quotedValue],
        ['version', 'новая версия', value => formatValue(value, 'не указана')]
      ]);
      return `Изменить файл ${quotedValue(args.documentName)}: ${changes}?`;
    }
    case 'erp_actions_erp_file_archive':
      return `Перенести файл ${quotedValue(args.documentName)} в архив во всей ERP? Он перестанет отображаться у всех связанных сущностей.`;
    case 'erp_actions_erp_file_restore':
      return `Восстановить файл ${quotedValue(args.documentName)} из архива ERP? Его сохранённые привязки снова станут видимыми.`;
    case 'knowledge_actions_knowledge_document_create': {
      const kind = args.kind === 'section' ? 'раздел' : 'документ';
      const parent = args.parentTitle
        ? ` в разделе ${quotedValue(args.parentTitle)}`
        : '';
      const content =
        args.kind !== 'section' && args.content !== undefined
          ? ` Содержимое: ${contentPreviewValue(args.content)}.`
          : '';
      return `Создать ${kind} ${quotedValue(args.title)}${parent}?${content}`;
    }
    case 'knowledge_actions_knowledge_document_update': {
      const changes = formatChanges(args, [
        ['title', 'новое название', quotedValue],
        ['content', 'новое содержимое', contentPreviewValue]
      ]);
      return `Изменить ${quotedValue(args.documentTitle)}: ${changes}?`;
    }
    case 'knowledge_actions_knowledge_document_archive':
      return `Перенести ${quotedValue(args.documentTitle)} в архив? Если это раздел, вложенные элементы останутся активными и переместятся на уровень выше.`;
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
  buildApprovalQuestion(approval);
