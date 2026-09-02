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
});
