import { describe, expect, test } from 'bun:test';
import { isStaleApprovalResponse } from '../src/services/mastraApproval';

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
