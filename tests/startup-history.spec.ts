import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  matchesPreparedStartupHistory,
  type PreparedStartupHistory
} from '../src/utils/startup-history';

const prepared: PreparedStartupHistory = {
  available: true,
  userId: 'user',
  apiUrl: 'https://chat.test/',
  topicId: 'topic',
  startedAt: 100_000,
  data: [{ id: 'message' }]
};
const matches = (result: PreparedStartupHistory | null, now = 100_500) =>
  matchesPreparedStartupHistory(
    result,
    'user',
    'https://chat.test',
    'topic',
    now
  );

describe('Ранний ответ Android', () => {
  it('принимает свежий ответ только для текущего пользователя, сервера и чата', () => {
    assert.equal(matches(prepared), true);
    for (const changes of [
      { userId: 'another-user' },
      { userId: '' },
      { apiUrl: 'https://other.test' },
      { topicId: 'other-topic' },
      { topicId: '' }
    ]) {
      assert.equal(matches({ ...prepared, ...changes }), false);
    }
  });
  it('отклоняет устаревший ответ, перевод часов и неполный результат', () => {
    assert.equal(matches(prepared, 109_999), true);
    assert.equal(matches(prepared, 110_000), false);
    assert.equal(matches(prepared, 99_999), false);
    assert.equal(matches(null), false);
    assert.equal(matches({ ...prepared, available: false }), false);
    assert.equal(matches({ ...prepared, startedAt: undefined }), false);
    assert.equal(matches({ ...prepared, data: {} }), false);
  });
});
