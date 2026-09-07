import { describe, expect, test } from 'bun:test';
import {
  formatApprovalMessage,
  isStaleApprovalResponse
} from '../src/services/mastraApproval';

describe('isStaleApprovalResponse', () => {
  test.each([
    'could not find an active or suspended run for thread',
    'could not find a suspended run for runId',
    {
      error:
        'The run may have already completed. Ensure resumeStream() is called with a currently-suspended run.'
    },
    { code: 'AGENT_SEND_TOOL_APPROVAL_NO_ACTIVE_THREAD_RUN' }
  ])('распознаёт устаревшее подтверждение Mastra', payload => {
    expect(isStaleApprovalResponse(payload)).toBe(true);
  });

  test('не считает обычную серверную ошибку устаревшим подтверждением', () => {
    expect(isStaleApprovalResponse({ error: 'Internal Server Error' })).toBe(
      false
    );
  });
});

describe('formatApprovalMessage', () => {
  test('показывает только вопрос для карточки с кнопками подтверждения', () => {
    const message = formatApprovalMessage({
      runId: 'run-test',
      toolCallId: 'tool-test',
      toolName: 'erp_actions_erp_specification_item_update',
      args: {
        parentType: 'cbed',
        parentName: 'Насосная станция',
        parentDesignation: '022.01-12.00СБ',
        section: 'detal',
        itemName: 'Палец (комбипривод)',
        itemDesignation: '119.01-03.03.03',
        quantity: 1
      }
    });

    expect(message).not.toContain('Ответьте');
    expect(message).not.toMatch(/[—–]/u);
    expect(message).toContain('количество: 1');
  });

  test('описывает расписание без технического токена и cron', () => {
    const message = formatApprovalMessage({
      runId: 'run-test',
      toolCallId: 'tool-test',
      toolName: 'automation_schedule_create',
      args: {
        title: 'Утренняя сводка',
        task: 'Подготовь сводку по дефициту изделий ERP',
        recurrence: { kind: 'daily', times: ['08:00'] },
        timezone: 'Europe/Moscow',
        capabilityCheckToken: 'internal-token'
      }
    });

    expect(message).toContain('ежедневно в 08:00');
    expect(message).toContain('Подготовь сводку по дефициту изделий ERP');
    expect(message).not.toContain('internal-token');
    expect(message).not.toContain('cron');
  });

  test('понятно описывает создание отгрузки со счётом из чата', () => {
    const message = formatApprovalMessage({
      runId: 'run-test',
      toolCallId: 'tool-test',
      toolName: 'erp_actions_erp_shipment_create_with_attachment',
      args: {
        attachmentName: 'Счёт 174.pdf',
        productName: 'Насосная станция',
        productDesignation: '022.01-12.00СБ',
        buyerName: 'ООО Пример',
        quantity: 2,
        plannedShipmentAt: '2026-09-15'
      }
    });

    expect(message).toContain('Создать задачу на отгрузку');
    expect(message).toContain('ООО Пример');
    expect(message).toContain('Счёт 174.pdf');
    expect(message).toContain('прикреплён к задаче');
    expect(message).not.toMatch(/[—–]/u);
  });
});
