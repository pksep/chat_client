import { expect, test } from 'bun:test';
import { mergeRemoteParticipantsDuringReconnect } from '../src/services/call-reconnect-participants';

test('keeps all known group-call participants visible while LiveKit reconnects', () => {
  const reconnectingParticipants = [
    { identity: 'david', name: 'David' },
    { identity: 'oleg', name: 'Oleg' },
    { identity: 'misha', name: 'Misha' }
  ];

  expect(
    mergeRemoteParticipantsDuringReconnect([], reconnectingParticipants, true)
  ).toEqual(reconnectingParticipants);
});

test('replaces a cached participant with fresh LiveKit data after reconnect', () => {
  const cachedParticipant = { identity: 'david', name: 'David (cached)' };
  const activeParticipant = { identity: 'david', name: 'David' };

  expect(
    mergeRemoteParticipantsDuringReconnect(
      [activeParticipant],
      [cachedParticipant, { identity: 'oleg', name: 'Oleg' }],
      true
    )
  ).toEqual([activeParticipant, { identity: 'oleg', name: 'Oleg' }]);
});

test('does not keep cached participants after reconnect has completed', () => {
  const activeParticipant = { identity: 'david', name: 'David' };

  expect(
    mergeRemoteParticipantsDuringReconnect(
      [activeParticipant],
      [{ identity: 'oleg', name: 'Oleg' }],
      false
    )
  ).toEqual([activeParticipant]);
});
