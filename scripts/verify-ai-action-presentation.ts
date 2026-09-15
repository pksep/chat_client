import assert from 'node:assert/strict';
import { actionTaskSummary } from '../src/services/aiActionTaskPresentation';
import type { AiActionTask } from '../src/services/aiActionTaskContract';

const task: AiActionTask = {
  id: 'plan',
  requestId: 'request',
  title: 'Создать деталь',
  revision: 1,
  version: 1,
  digest: 'a'.repeat(64),
  approved: true,
  createdAt: 1,
  updatedAt: 1,
  completed: 1,
  status: 'completed',
  steps: [
    {
      key: 'create',
      title: 'Создать деталь',
      status: 'completed',
      dependencies: [],
      details: { toolName: 'erp_entity_editor_create', input: {} }
    }
  ]
};
let passed = 0;
for (const status of [
  'completed',
  'running',
  'needs_review',
  'waiting_approval',
  'pending'
] as const) {
  for (const stepStatus of [
    'completed',
    'cancelled',
    'running',
    'verifying',
    'uncertain',
    'pending',
    'blocked',
    'waiting_approval'
  ] as const) {
    assert.equal(
      actionTaskSummary({
        ...task,
        status,
        steps: [
          {
            ...task.steps[0],
            status: stepStatus,
            message: 'Внутренняя подпись статуса',
            resolution: 'Служебное состояние'
          }
        ]
      }),
      ''
    );
    passed++;
  }
}
for (const status of ['failed', 'partial'] as const) {
  const failure = {
    ...task,
    status,
    steps: [
      {
        ...task.steps[0],
        status: 'failed' as const,
        message: 'Деталь уже существует.',
        resolution: 'Используйте найденную карточку.'
      }
    ]
  };
  assert.equal(
    actionTaskSummary(failure),
    'Создать деталь: Деталь уже существует. Используйте найденную карточку.'
  );
  assert.equal(
    actionTaskSummary({
      ...failure,
      steps: [
        { ...failure.steps[0], message: undefined, resolution: undefined }
      ]
    }),
    ''
  );
  passed += 2;
}
console.log(`${passed} проверок представления поручения прошли`);
