import type { Room } from 'livekit-client';

type TelemetryLevel = 'debug' | 'info' | 'warn' | 'error';
type TransportRole = 'publisher' | 'subscriber';

type RtcTransport = {
  getStats(): Promise<RTCStatsReport>;
  getConnectionState?: () => RTCPeerConnectionState;
  getICEConnectionState?: () => RTCIceConnectionState;
  getSignallingState?: () => RTCSignalingState;
};

type CounterSnapshot = {
  timestamp: number;
  bytesReceived: number;
  bytesSent: number;
  packetsLost: number;
  packetsReceived: number;
};

type PreviousStats = Map<string, CounterSnapshot>;

export type WebRtcCandidatePairSummary = {
  state: string | null;
  protocol: string | null;
  relayProtocol: string | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
  networkType: string | null;
  connectionPath: 'direct' | 'turn-relay' | 'unknown';
  currentRoundTripTimeMs: number | null;
  availableOutgoingBitrate: number | null;
  availableIncomingBitrate: number | null;
};

export type WebRtcStatsSummary = {
  inboundBitrateBps: number | null;
  outboundBitrateBps: number | null;
  packetsLost: number;
  packetsReceived: number;
  packetLossPercent: number | null;
  jitterMs: number | null;
  roundTripTimeMs: number | null;
  framesDropped: number;
  framesDecoded: number;
  framesEncoded: number;
  freezeCount: number;
  totalFreezesDurationMs: number;
  nackCount: number;
  pliCount: number;
  firCount: number;
  dtlsState: string | null;
  iceRole: string | null;
  selectedCandidatePair: WebRtcCandidatePairSummary | null;
};

type TransportSnapshot = WebRtcStatsSummary & {
  role: TransportRole;
  peerConnectionState: RTCPeerConnectionState | null;
  iceConnectionState: RTCIceConnectionState | null;
  signalingState: RTCSignalingState | null;
};

type RoomDiagnosticsState = {
  timer: ReturnType<typeof setInterval> | null;
  previousByTransport: Record<TransportRole, PreviousStats>;
  inFlight: Promise<void> | null;
  lastSnapshot: Record<string, unknown> | null;
  lastSnapshotAt: number | null;
};

type StatsEmitter = (
  room: Room,
  eventName: string,
  payload: Record<string, unknown>,
  level: TelemetryLevel
) => void;

const numberOrZero = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const nullableNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const getStatsRows = (report: RTCStatsReport): Map<string, any> => {
  const rows = new Map<string, any>();
  report.forEach(stat => rows.set(stat.id, stat));
  return rows;
};

const resolveSelectedCandidatePair = (
  rows: Map<string, any>
): WebRtcCandidatePairSummary | null => {
  const transport = [...rows.values()].find(stat => stat.type === 'transport');
  const selectedId = transport?.selectedCandidatePairId;
  const candidatePairs = [...rows.values()].filter(
    stat => stat.type === 'candidate-pair'
  );
  const pair =
    (selectedId ? rows.get(selectedId) : null) ||
    candidatePairs.find(stat => stat.selected) ||
    candidatePairs.find(stat => stat.nominated && stat.state === 'succeeded') ||
    null;

  if (!pair) return null;

  const localCandidate = rows.get(pair.localCandidateId) || {};
  const remoteCandidate = rows.get(pair.remoteCandidateId) || {};
  const localCandidateType = localCandidate.candidateType || null;
  const remoteCandidateType = remoteCandidate.candidateType || null;
  const isRelay =
    localCandidateType === 'relay' || remoteCandidateType === 'relay';

  return {
    state: pair.state || null,
    protocol: localCandidate.protocol || remoteCandidate.protocol || null,
    relayProtocol:
      localCandidate.relayProtocol || remoteCandidate.relayProtocol || null,
    localCandidateType,
    remoteCandidateType,
    networkType: localCandidate.networkType || null,
    connectionPath: isRelay
      ? 'turn-relay'
      : localCandidateType || remoteCandidateType
        ? 'direct'
        : 'unknown',
    currentRoundTripTimeMs:
      nullableNumber(pair.currentRoundTripTime) === null
        ? null
        : numberOrZero(pair.currentRoundTripTime) * 1000,
    availableOutgoingBitrate: nullableNumber(pair.availableOutgoingBitrate),
    availableIncomingBitrate: nullableNumber(pair.availableIncomingBitrate)
  };
};

const calculateBitrate = (
  stat: any,
  previous: CounterSnapshot | undefined,
  key: 'bytesReceived' | 'bytesSent'
): number | null => {
  if (!previous || typeof stat.timestamp !== 'number') return null;

  const elapsedMs = stat.timestamp - previous.timestamp;
  const byteDelta = numberOrZero(stat[key]) - previous[key];
  if (elapsedMs <= 0 || byteDelta < 0) return null;

  return (byteDelta * 8 * 1000) / elapsedMs;
};

export const summarizeRtcStats = (
  report: RTCStatsReport,
  previous: PreviousStats = new Map()
): { summary: WebRtcStatsSummary; next: PreviousStats } => {
  const rows = getStatsRows(report);
  const next: PreviousStats = new Map();
  let inboundBitrateBps = 0;
  let outboundBitrateBps = 0;
  let hasInboundBitrate = false;
  let hasOutboundBitrate = false;
  let packetsLost = 0;
  let packetsReceived = 0;
  let jitterMs: number | null = null;
  let roundTripTimeMs: number | null = null;
  let framesDropped = 0;
  let framesDecoded = 0;
  let framesEncoded = 0;
  let freezeCount = 0;
  let totalFreezesDurationMs = 0;
  let nackCount = 0;
  let pliCount = 0;
  let firCount = 0;

  rows.forEach(stat => {
    if (
      stat.type !== 'inbound-rtp' &&
      stat.type !== 'outbound-rtp' &&
      stat.type !== 'remote-inbound-rtp'
    ) {
      return;
    }

    const previousStat = previous.get(stat.id);
    next.set(stat.id, {
      timestamp: numberOrZero(stat.timestamp),
      bytesReceived: numberOrZero(stat.bytesReceived),
      bytesSent: numberOrZero(stat.bytesSent),
      packetsLost: numberOrZero(stat.packetsLost),
      packetsReceived: numberOrZero(stat.packetsReceived)
    });

    if (stat.type === 'inbound-rtp') {
      const bitrate = calculateBitrate(stat, previousStat, 'bytesReceived');
      if (bitrate !== null) {
        inboundBitrateBps += bitrate;
        hasInboundBitrate = true;
      }

      const lostDelta = previousStat
        ? Math.max(0, numberOrZero(stat.packetsLost) - previousStat.packetsLost)
        : 0;
      const receivedDelta = previousStat
        ? Math.max(
            0,
            numberOrZero(stat.packetsReceived) - previousStat.packetsReceived
          )
        : 0;
      packetsLost += lostDelta;
      packetsReceived += receivedDelta;
      const statJitterMs = nullableNumber(stat.jitter);
      if (statJitterMs !== null) {
        jitterMs = Math.max(jitterMs ?? 0, statJitterMs * 1000);
      }
      framesDropped += numberOrZero(stat.framesDropped);
      framesDecoded += numberOrZero(stat.framesDecoded);
      freezeCount += numberOrZero(stat.freezeCount);
      totalFreezesDurationMs += numberOrZero(stat.totalFreezesDuration) * 1000;
    }

    if (stat.type === 'outbound-rtp') {
      const bitrate = calculateBitrate(stat, previousStat, 'bytesSent');
      if (bitrate !== null) {
        outboundBitrateBps += bitrate;
        hasOutboundBitrate = true;
      }
      framesEncoded += numberOrZero(stat.framesEncoded);
    }

    if (stat.type === 'remote-inbound-rtp') {
      const statRttMs = nullableNumber(stat.roundTripTime);
      if (statRttMs !== null) {
        roundTripTimeMs = Math.max(roundTripTimeMs ?? 0, statRttMs * 1000);
      }
    }

    nackCount += numberOrZero(stat.nackCount);
    pliCount += numberOrZero(stat.pliCount);
    firCount += numberOrZero(stat.firCount);
  });

  const pair = resolveSelectedCandidatePair(rows);
  const transport = [...rows.values()].find(stat => stat.type === 'transport');
  if (pair?.currentRoundTripTimeMs != null) {
    roundTripTimeMs = Math.max(
      roundTripTimeMs ?? 0,
      pair.currentRoundTripTimeMs ?? 0
    );
  }
  const packetTotal = packetsLost + packetsReceived;

  return {
    summary: {
      inboundBitrateBps: hasInboundBitrate
        ? Math.round(inboundBitrateBps)
        : null,
      outboundBitrateBps: hasOutboundBitrate
        ? Math.round(outboundBitrateBps)
        : null,
      packetsLost,
      packetsReceived,
      packetLossPercent:
        packetTotal > 0 ? (packetsLost / packetTotal) * 100 : null,
      jitterMs,
      roundTripTimeMs,
      framesDropped,
      framesDecoded,
      framesEncoded,
      freezeCount,
      totalFreezesDurationMs,
      nackCount,
      pliCount,
      firCount,
      dtlsState: transport?.dtlsState || null,
      iceRole: transport?.iceRole || null,
      selectedCandidatePair: pair
    },
    next
  };
};

const getRoomTransports = (
  room: Room
): Array<{ role: TransportRole; transport: RtcTransport }> => {
  const manager = room.engine.pcManager;
  const transports: Array<{ role: TransportRole; transport: RtcTransport }> =
    [];
  if (manager?.publisher) {
    transports.push({ role: 'publisher', transport: manager.publisher });
  }
  if (manager?.subscriber) {
    transports.push({ role: 'subscriber', transport: manager.subscriber });
  }
  return transports;
};

export const createCallWebRtcDiagnostics = (
  emit: StatsEmitter,
  intervalMs = 15_000,
  now = Date.now
) => {
  const states = new Map<Room, RoomDiagnosticsState>();

  const capture = async (
    room: Room,
    trigger: string,
    level: TelemetryLevel = 'debug'
  ): Promise<void> => {
    const state = states.get(room);
    if (!state) return;
    if (state.inFlight && trigger === 'periodic') return;
    if (state.inFlight) {
      await state.inFlight;
      if (!states.has(room)) return;
    }

    const task = (async () => {
      try {
        const transports: TransportSnapshot[] = [];
        for (const entry of getRoomTransports(room)) {
          const report = await entry.transport.getStats();
          const result = summarizeRtcStats(
            report,
            state.previousByTransport[entry.role]
          );
          state.previousByTransport[entry.role] = result.next;
          transports.push({
            role: entry.role,
            peerConnectionState: entry.transport.getConnectionState?.() ?? null,
            iceConnectionState:
              entry.transport.getICEConnectionState?.() ?? null,
            signalingState: entry.transport.getSignallingState?.() ?? null,
            ...result.summary
          });
        }

        const snapshot = {
          trigger,
          sampledAt: new Date(now()).toISOString(),
          transportCount: transports.length,
          transports
        };
        state.lastSnapshot = snapshot;
        state.lastSnapshotAt = now();
        emit(room, 'call.webrtc.stats', snapshot, level);
      } catch (error) {
        emit(
          room,
          'call.webrtc.stats_failed',
          {
            trigger,
            errorName: error instanceof Error ? error.name : 'Error',
            errorMessage:
              error instanceof Error ? error.message : String(error),
            lastSnapshotAgeMs:
              state.lastSnapshotAt === null
                ? null
                : Math.max(0, now() - state.lastSnapshotAt),
            lastSnapshot: state.lastSnapshot
          },
          trigger === 'periodic' ? 'debug' : 'warn'
        );
      }
    })();

    state.inFlight = task;
    await task.finally(() => {
      if (state.inFlight === task) state.inFlight = null;
    });
  };

  return {
    start(room: Room) {
      const previous = states.get(room);
      if (previous?.timer) clearInterval(previous.timer);
      const state: RoomDiagnosticsState = {
        timer: null,
        previousByTransport: {
          publisher: new Map(),
          subscriber: new Map()
        },
        inFlight: null,
        lastSnapshot: null,
        lastSnapshotAt: null
      };
      states.set(room, state);
      state.timer = setInterval(() => {
        void capture(room, 'periodic');
      }, intervalMs);
      void capture(room, 'connected', 'info');
    },
    capture,
    stop(room: Room) {
      const state = states.get(room);
      if (state?.timer) clearInterval(state.timer);
      states.delete(room);
    }
  };
};
