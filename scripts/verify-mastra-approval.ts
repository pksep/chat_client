import {
  approvalDecisionFromMessage,
  findPendingToolApproval,
  formatApprovalMessage
} from '../src/services/mastraApproval';
import { getMastraToolError } from '../src/services/mastraEventStream';

const assertEqual = (actual: string, expected: string): void => {
  if (actual !== expected) {
    throw new Error(`Некорректный текст подтверждения: ${actual}`);
  }
};

const productMessage = formatApprovalMessage({
  runId: 'run-1',
  toolCallId: 'tool-1',
  toolName: 'erp_actions_erp_entity_editor_update',
  args: {
    type: 'product',
    entityName: 'Траверса для ямных подъемников серии КП 15т. Т15',
    entityDesignation: '109.02-00СБ',
    changes: {
      responsibleName: 'Елкина',
      discontinued: true
    }
  }
});

assertEqual(
  productMessage,
  'Изменить изделие «Траверса для ямных подъемников серии КП 15т. Т15» с обозначением «109.02-00СБ»: ответственный: «Елкина»; Снято с производства: да?'
);

if (
  productMessage.includes('выполнение действия') ||
  productMessage.includes('[object Object]')
) {
  throw new Error('В подтверждение попал общий или технический текст.');
}

for (const confirmation of [
  'да',
  'Да.',
  'подтверждаю',
  'подтвердить',
  'согласен',
  'согласна',
  'хорошо',
  'ок',
  'окей'
]) {
  if (approvalDecisionFromMessage(confirmation) !== 'approve') {
    throw new Error(`Не распознано подтверждение: ${confirmation}`);
  }
}

for (const rejection of [
  'нет',
  'Нет.',
  'отмена',
  'отменить',
  'не подтверждаю',
  'отклонить'
]) {
  if (approvalDecisionFromMessage(rejection) !== 'decline') {
    throw new Error(`Не распознан отказ: ${rejection}`);
  }
}

if (approvalDecisionFromMessage('да, но измени время') !== null) {
  throw new Error('Неоднозначный ответ ошибочно принят за подтверждение.');
}

const restoredApproval = findPendingToolApproval([
  { pendingToolApproval: null },
  {
    pendingToolApproval: {
      runId: 'run-restored',
      toolCallId: 'tool-restored',
      toolName: 'automation_schedule_create',
      args: { title: 'Ежедневная сводка' }
    }
  }
]);

if (restoredApproval?.toolCallId !== 'tool-restored') {
  throw new Error('Ожидающее подтверждение не восстановлено из истории.');
}

const toolError = getMastraToolError({
  type: 'tool-error',
  payload: {
    toolName: 'automation_schedule_create',
    error: { message: 'Tool execution failed' }
  }
});

if (toolError !== 'Tool execution failed') {
  throw new Error('Ошибка инструмента не извлечена из потока Mastra.');
}

const storedToolError = getMastraToolError({
  type: 'tool-output',
  payload: {
    toolInvocation: {
      state: 'output-error',
      errorText: 'Stored tool failure'
    }
  }
});

if (storedToolError !== 'Stored tool failure') {
  throw new Error('Сохранённая ошибка инструмента не распознана.');
}

const detailMessage = formatApprovalMessage({
  runId: 'run-2',
  toolCallId: 'tool-2',
  toolName: 'erp_actions_erp_entity_editor_update',
  args: {
    type: 'detal',
    entityDesignation: 'Д-10',
    changes: {
      attention: false,
      parameters: [{ name: 'Длина', unit: 'мм', value: 20 }],
      mainMaterialName: null
    }
  }
});

assertEqual(
  detailMessage,
  'Изменить деталь с обозначением «Д-10»: Выделить в поиске: нет; параметры: «Длина»: 20 мм; основной материал: не указан?'
);

const operationMessage = formatApprovalMessage({
  runId: 'run-3',
  toolCallId: 'tool-3',
  toolName: 'erp_actions_erp_technology_operation_update',
  args: {
    entityType: 'cbed',
    entityName: 'Насосная станция',
    entityDesignation: '022.01-12.00СБ',
    operationName: 'Токарная',
    changes: {
      mainTime: 15,
      note: 'Проверить первый размер',
      resources: {
        equipment: { add: ['Станок 16К20'] },
        measuringInstruments: { remove: ['Штангенциркуль'] }
      }
    }
  }
});

assertEqual(
  operationMessage,
  'Изменить операцию «Токарная» в технологическом процессе сборочной единицы «Насосная станция» с обозначением «022.01-12.00СБ»: основное время: 15; примечание: «Проверить первый размер»; добавить оборудование: «Станок 16К20»; убрать мерительный инструмент: «Штангенциркуль»?'
);

const removeOperationMessage = formatApprovalMessage({
  runId: 'run-4',
  toolCallId: 'tool-4',
  toolName: 'erp_actions_erp_technology_operation_remove',
  args: {
    entityType: 'detal',
    entityDesignation: 'Д-10',
    operationPosition: 3
  }
});

assertEqual(
  removeOperationMessage,
  'Убрать операцию на позиции 3 из технологического процесса детали с обозначением «Д-10»? Операция будет перенесена в архив ERP.'
);

console.log(
  '✓ Подтверждения сохраняются, распознаются и не скрывают ошибки инструментов'
);
