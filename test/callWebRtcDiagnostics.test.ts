import { expect, test } from 'bun:test';
import { summarizeRtcStats } from '../src/services/call-webrtc-diagnostics';

const report = (...stats: Array<Record<string, unknown>>) => {
  const rows = new Map(stats.map(stat => [String(stat.id), stat]));
  return rows as unknown as RTCStatsReport;
};

test('считает интервальные bitrate, packet loss, RTT и медиасчётчики', () => {
  const first = summarizeRtcStats(
    report(
      {
        id: 'in-audio',
        type: 'inbound-rtp',
        timestamp: 1_000,
        bytesReceived: 1_000,
        packetsLost: 2,
        packetsReceived: 98,
        jitter: 0.012,
        nackCount: 3
      },
      {
        id: 'out-video',
        type: 'outbound-rtp',
        timestamp: 1_000,
        bytesSent: 2_000,
        framesEncoded: 20,
        pliCount: 1
      }
    )
  );

  const second = summarizeRtcStats(
    report(
      {
        id: 'in-audio',
        type: 'inbound-rtp',
        timestamp: 3_000,
        bytesReceived: 5_000,
        packetsLost: 4,
        packetsReceived: 196,
        jitter: 0.02,
        framesDropped: 2,
        framesDecoded: 120,
        freezeCount: 1,
        totalFreezesDuration: 0.4,
        nackCount: 8
      },
      {
        id: 'out-video',
        type: 'outbound-rtp',
        timestamp: 3_000,
        bytesSent: 8_000,
        framesEncoded: 75,
        pliCount: 4,
        firCount: 2
      },
      {
        id: 'remote-in-video',
        type: 'remote-inbound-rtp',
        timestamp: 3_000,
        roundTripTime: 0.125
      }
    ),
    first.next
  );

  expect(second.summary).toMatchObject({
    inboundBitrateBps: 16_000,
    outboundBitrateBps: 24_000,
    packetsLost: 2,
    packetsReceived: 98,
    packetLossPercent: 2,
    jitterMs: 20,
    roundTripTimeMs: 125,
    framesDropped: 2,
    framesDecoded: 120,
    framesEncoded: 75,
    freezeCount: 1,
    totalFreezesDurationMs: 400,
    nackCount: 8,
    pliCount: 4,
    firCount: 2
  });
});

test('определяет прямое UDP-соединение по выбранной candidate pair', () => {
  const result = summarizeRtcStats(
    report(
      {
        id: 'transport',
        type: 'transport',
        selectedCandidatePairId: 'pair'
      },
      {
        id: 'pair',
        type: 'candidate-pair',
        state: 'succeeded',
        localCandidateId: 'local',
        remoteCandidateId: 'remote',
        currentRoundTripTime: 0.05
      },
      {
        id: 'local',
        type: 'local-candidate',
        candidateType: 'host',
        protocol: 'udp',
        networkType: 'wifi'
      },
      {
        id: 'remote',
        type: 'remote-candidate',
        candidateType: 'srflx',
        protocol: 'udp'
      }
    )
  );

  expect(result.summary.selectedCandidatePair).toEqual({
    state: 'succeeded',
    protocol: 'udp',
    relayProtocol: null,
    localCandidateType: 'host',
    remoteCandidateType: 'srflx',
    networkType: 'wifi',
    connectionPath: 'direct',
    currentRoundTripTimeMs: 50,
    availableOutgoingBitrate: null,
    availableIncomingBitrate: null
  });
});

test('определяет TURN relay поверх TLS', () => {
  const result = summarizeRtcStats(
    report(
      {
        id: 'pair',
        type: 'candidate-pair',
        nominated: true,
        state: 'succeeded',
        localCandidateId: 'relay',
        remoteCandidateId: 'remote'
      },
      {
        id: 'relay',
        type: 'local-candidate',
        candidateType: 'relay',
        protocol: 'tcp',
        relayProtocol: 'tls'
      },
      {
        id: 'remote',
        type: 'remote-candidate',
        candidateType: 'host',
        protocol: 'tcp'
      }
    )
  );

  expect(result.summary.selectedCandidatePair).toMatchObject({
    protocol: 'tcp',
    relayProtocol: 'tls',
    connectionPath: 'turn-relay'
  });
});
