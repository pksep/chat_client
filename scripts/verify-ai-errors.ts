import { strict as assert } from 'node:assert';
import { isStaleApprovalResponse } from '../src/services/mastraApproval';
import {
  validateAiAttachments,
  AI_MAX_ATTACHMENT_BYTES
} from '../src/services/aiAttachmentLimits';
import {
  getAiErrorMessage,
  AI_UNKNOWN_ERROR
} from '../src/services/aiErrorMessages';

for (const count of [0, 1, 9, 10]) {
  assert.doesNotThrow(() =>
    validateAiAttachments(
      Array.from({ length: count }, () => ({ name: 'test.txt', size: 1 }))
    )
  );
}
for (const count of [11, 20]) {
  assert.throws(
    () =>
      validateAiAttachments(
        Array.from({ length: count }, () => ({ name: 'test.txt', size: 1 }))
      ),
    new RegExp(`Выбрано: ${count}`)
  );
}
assert.doesNotThrow(() =>
  validateAiAttachments([{ name: 'test', size: AI_MAX_ATTACHMENT_BYTES }])
);
assert.throws(
  () =>
    validateAiAttachments([
      { name: 'test', size: AI_MAX_ATTACHMENT_BYTES + 1 }
    ]),
  /50 МБ/
);
assert.throws(
  () => validateAiAttachments([{ name: 'test', size: 0 }]),
  /Пустые файлы/
);

for (const status of [400, 403, 410, 413, 429, 500, 503]) {
  const userMessage =
    'Можно прикрепить не более 10 файлов. Уберите лишние файлы.';
  assert.equal(
    getAiErrorMessage(
      Object.assign(new Error('HTTP wrapper with JSON'), {
        status,
        body: { code: 'AI_ATTACHMENT_COUNT_LIMIT', userMessage }
      })
    ),
    userMessage
  );
}
assert.match(getAiErrorMessage({ status: 401 }), /Войдите/);
assert.match(getAiErrorMessage(new Error('Failed to fetch')), /соединение/);
assert.match(getAiErrorMessage(new Error('timeout')), /не успел/);
assert.equal(
  getAiErrorMessage({ status: 500, body: { error: 'secret stack' } }),
  AI_UNKNOWN_ERROR
);
assert.equal(
  getAiErrorMessage(new Error('Ошибка {"transferToken":"secret"}')),
  AI_UNKNOWN_ERROR
);
assert.equal(
  getAiErrorMessage({
    code: 'AI_REQUEST_500',
    userMessage: 'Ошибка Bearer secret'
  }),
  AI_UNKNOWN_ERROR
);
assert.equal(
  getAiErrorMessage({
    code: 'AI_ATTACHMENT_EXPIRED',
    userMessage: 'Срок доступа к вложению истёк. Прикрепите файл заново.'
  }),
  'Срок доступа к вложению истёк. Прикрепите файл заново.'
);
assert.equal(
  getAiErrorMessage(
    new Error('Сервис временно недоступен. Попробуйте ещё раз позже.')
  ),
  AI_UNKNOWN_ERROR
);
console.log(
  'Проверки ограничений вложений и пользовательских ошибок пройдены.'
);

for (const body of [
  {
    code: 'AI_APPROVAL_STALE',
    userMessage: 'Подтверждение больше не действует.'
  },
  { code: 'AGENT_SEND_TOOL_APPROVAL_NO_ACTIVE_THREAD_RUN' },
  { message: 'Could not find a suspended run' }
]) {
  assert.equal(isStaleApprovalResponse(body), true);
  assert.equal(isStaleApprovalResponse(JSON.stringify(body)), true);
}
assert.equal(
  isStaleApprovalResponse({
    code: 'AI_REQUEST_403',
    message: 'Could not find a suspended run'
  }),
  false
);
assert.equal(isStaleApprovalResponse({ code: 'AI_ATTACHMENT_EXPIRED' }), false);
