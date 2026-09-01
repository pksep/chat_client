import { formatApprovalMessage } from '../src/services/mastraApproval';

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

console.log('✓ Подтверждения ERP сформированы человеческим языком');
