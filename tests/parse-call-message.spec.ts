import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCallMessage } from '../src/utils/parseCallMessage';

const unanswered = {
  type: 'call',
  call: {
    event: 'end',
    creatorId: 'caller',
    direction: 'missed',
    wasAnswered: false,
    durationSec: 30
  }
};

describe('неотвеченные звонки', () => {
  it('показывает звонившему исходящий без ответа, даже если итог отправил собеседник', () => {
    assert.deepEqual(
      parseCallMessage('', {
        messageEx: unanswered,
        authUserId: 'caller',
        isMeSender: false
      }),
      {
        kind: 'outgoing',
        title: 'Исходящий',
        duration: null,
        isOutgoing: true,
        noAnswer: true
      }
    );
  });

  it('показывает получателю пропущенный, даже если он отправил итог звонка', () => {
    assert.deepEqual(
      parseCallMessage('', {
        messageEx: JSON.stringify(unanswered),
        authUserId: 'recipient',
        isMeSender: true
      }),
      {
        kind: 'missed',
        title: 'Пропущенный',
        duration: null,
        isOutgoing: false,
        noAnswer: false
      }
    );
  });

  for (const isMeSender of [true, false]) {
    it(`использует отправителя старого события без creatorId: ${isMeSender}`, () => {
      const parsed = parseCallMessage('', {
        messageEx: {
          type: 'call',
          call: { event: 'end', direction: 'missed' }
        },
        isMeSender
      });
      assert.equal(parsed?.kind, isMeSender ? 'outgoing' : 'missed');
      assert.equal(parsed?.noAnswer, isMeSender);
    });
  }

  it('распознаёт отсутствие ответа по wasAnswered без direction', () => {
    const parsed = parseCallMessage('', {
      messageEx: {
        type: 'call',
        call: { event: 'end', creatorId: 'caller', wasAnswered: false }
      },
      authUserId: 'caller'
    });
    assert.equal(parsed?.noAnswer, true);
    assert.equal(parsed?.kind, 'outgoing');
  });

  it('сохраняет направление и длительность принятого звонка для обеих сторон', () => {
    for (const authUserId of ['caller', 'recipient']) {
      const parsed = parseCallMessage('', {
        messageEx: {
          type: 'call',
          call: {
            event: 'end',
            creatorId: 'caller',
            wasAnswered: true,
            durationSec: 74
          }
        },
        authUserId
      });
      assert.equal(
        parsed?.kind,
        authUserId === 'caller' ? 'outgoing' : 'incoming'
      );
      assert.equal(parsed?.duration, '1 мин 14 сек');
      assert.equal(parsed?.noAnswer, false);
    }
  });

  it('не показывает отсутствие ответа до завершения звонка', () => {
    const parsed = parseCallMessage('', {
      messageEx: {
        ...unanswered,
        call: { ...unanswered.call, event: 'start' }
      },
      authUserId: 'caller'
    });
    assert.equal(parsed?.kind, 'outgoing');
    assert.equal(parsed?.noAnswer, false);
  });
});
