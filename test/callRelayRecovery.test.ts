import { expect, test } from 'bun:test';
import {
  createCallRelayRecoveryPolicy,
  extractRelayRecoverySamples
} from '../src/services/call-relay-recovery';

test('requests relay after three signal reconnects inside the window', () => {
  let now = 1_000;
  const policy = createCallRelayRecoveryPolicy({}, () => now);

  expect(policy.recordSignalReconnect()).toBeNull();
  now += 30_000;
  expect(policy.recordSignalReconnect()).toBeNull();
  now += 30_000;

  expect(policy.recordSignalReconnect()).toMatchObject({
    reason: 'repeated-signal-reconnect',
    signalReconnectCount: 3
  });
  expect(policy.recordSignalReconnect()).toBeNull();
});

test('does not react to reconnects outside the rolling window', () => {
  let now = 1_000;
  const policy = createCallRelayRecoveryPolicy({}, () => now);

  policy.recordSignalReconnect();
  now += 60_000;
  policy.recordSignalReconnect();
  now += 121_000;

  expect(policy.recordSignalReconnect()).toBeNull();
  expect(policy.snapshot().signalReconnectCount).toBe(1);
});

test('ignores one RTT spike and requests relay only after sustained high RTT', () => {
  const policy = createCallRelayRecoveryPolicy();
  const highRtt = [{ connectionPath: 'direct', roundTripTimeMs: 950 }] as const;

  expect(policy.recordStats([...highRtt])).toBeNull();
  expect(
    policy.recordStats([{ connectionPath: 'direct', roundTripTimeMs: 120 }])
  ).toBeNull();
  expect(policy.recordStats([...highRtt])).toBeNull();
  expect(policy.recordStats([...highRtt])).toBeNull();
  expect(policy.recordStats([...highRtt])).toMatchObject({
    reason: 'sustained-high-rtt',
    consecutiveHighRttSamples: 3,
    maxRoundTripTimeMs: 950
  });
});

test('does not use RTT from an existing TURN relay as a trigger', () => {
  const policy = createCallRelayRecoveryPolicy({
    highRttSampleThreshold: 1
  });

  expect(
    policy.recordStats([
      { connectionPath: 'turn-relay', roundTripTimeMs: 1_500 }
    ])
  ).toBeNull();
});

test('enforces cooldown after a failed relay attempt', () => {
  let now = 1_000;
  const policy = createCallRelayRecoveryPolicy(
    { signalReconnectThreshold: 1, retryCooldownMs: 60_000 },
    () => now
  );

  expect(policy.recordSignalReconnect()).not.toBeNull();
  policy.markRelayFailed();
  expect(policy.recordSignalReconnect()).toBeNull();
  now += 60_000;
  expect(policy.recordSignalReconnect()).not.toBeNull();
});

test('extracts only usable candidate-pair RTT samples', () => {
  expect(
    extractRelayRecoverySamples({
      transports: [
        {
          roundTripTimeMs: 820,
          selectedCandidatePair: { connectionPath: 'direct' }
        },
        {
          roundTripTimeMs: 50,
          selectedCandidatePair: { connectionPath: 'turn-relay' }
        },
        { roundTripTimeMs: 100 }
      ]
    })
  ).toEqual([
    { connectionPath: 'direct', roundTripTimeMs: 820 },
    { connectionPath: 'turn-relay', roundTripTimeMs: 50 }
  ]);
});
