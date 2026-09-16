import assert from 'node:assert/strict';
import { observeAiSubmission } from '../src/services/aiSubmission';

let callbacks = 0;
assert.deepEqual(
  await observeAiSubmission(
    async () => {},
    () => callbacks++
  ),
  { accepted: false, responseText: null }
);
assert.equal(callbacks, 0);
assert.deepEqual(
  await observeAiSubmission(async observer => {
    observer.respond('Прежний ответ до принятия');
  }),
  { accepted: false, responseText: null }
);
assert.deepEqual(
  await observeAiSubmission(
    async observer => {
      observer.accept();
      observer.accept();
      observer.respond('Ответ текущего вызова');
    },
    () => callbacks++
  ),
  { accepted: true, responseText: 'Ответ текущего вызова' }
);
assert.equal(callbacks, 1);
assert.deepEqual(
  await observeAiSubmission(async observer => {
    observer.accept();
    observer.respond('');
  }),
  { accepted: true, responseText: null }
);
assert.deepEqual(
  await observeAiSubmission(async observer => {
    observer.accept();
    observer.respond('Часть ответа');
    observer.respond(null);
  }),
  { accepted: true, responseText: null }
);
const results = await Promise.all(
  ['Первый', 'Второй'].map(text =>
    observeAiSubmission(async observer => {
      observer.accept();
      await Promise.resolve();
      observer.respond(text);
    })
  )
);
assert.deepEqual(
  results.map(result => result.responseText),
  ['Первый', 'Второй']
);
await assert.rejects(
  observeAiSubmission(async () => {
    throw new Error('До принятия');
  }),
  /До принятия/
);
await assert.rejects(
  observeAiSubmission(
    async observer => {
      observer.accept();
      throw new Error('После принятия');
    },
    () => callbacks++
  ),
  /После принятия/
);
assert.equal(callbacks, 2);
console.log(
  'Результат отправки: 8 проверок принятия, принадлежности ответа и ошибок прошли.'
);
