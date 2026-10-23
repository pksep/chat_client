export type RelayRecoveryReason =
  | 'repeated-signal-reconnect'
  | 'sustained-high-rtt';

export type RelayRecoverySample = {
  connectionPath: 'direct' | 'turn-relay' | 'unknown';
  roundTripTimeMs: number | null;
};

export type RelayRecoveryDecision = {
  reason: RelayRecoveryReason;
  signalReconnectCount: number;
  consecutiveHighRttSamples: number;
  maxRoundTripTimeMs: number | null;
};

type RelayRecoveryPolicyOptions = {
  signalReconnectThreshold: number;
  signalReconnectWindowMs: number;
  highRttThresholdMs: number;
  highRttSampleThreshold: number;
  retryCooldownMs: number;
};

const DEFAULT_OPTIONS: RelayRecoveryPolicyOptions = {
  signalReconnectThreshold: 3,
  signalReconnectWindowMs: 2 * 60 * 1000,
  highRttThresholdMs: 800,
  highRttSampleThreshold: 3,
  retryCooldownMs: 5 * 60 * 1000
};

export const extractRelayRecoverySamples = (
  payload: Record<string, unknown>
): RelayRecoverySample[] => {
  if (!Array.isArray(payload.transports)) {
    return [];
  }

  return payload.transports.flatMap(transport => {
    if (!transport || typeof transport !== 'object') {
      return [];
    }

    const candidatePair = (transport as Record<string, unknown>)
      .selectedCandidatePair;
    if (!candidatePair || typeof candidatePair !== 'object') {
      return [];
    }

    const candidate = candidatePair as Record<string, unknown>;
    const connectionPath = candidate.connectionPath;
    const roundTripTimeMs = (transport as Record<string, unknown>)
      .roundTripTimeMs;

    if (
      connectionPath !== 'direct' &&
      connectionPath !== 'turn-relay' &&
      connectionPath !== 'unknown'
    ) {
      return [];
    }

    return [
      {
        connectionPath,
        roundTripTimeMs:
          typeof roundTripTimeMs === 'number' &&
          Number.isFinite(roundTripTimeMs)
            ? roundTripTimeMs
            : null
      }
    ];
  });
};

export const createCallRelayRecoveryPolicy = (
  overrides: Partial<RelayRecoveryPolicyOptions> = {},
  now = Date.now
) => {
  const options = { ...DEFAULT_OPTIONS, ...overrides };
  let signalReconnects: number[] = [];
  let consecutiveHighRttSamples = 0;
  let lastMaxRoundTripTimeMs: number | null = null;
  let relayRequested = false;
  let retryNotBefore = 0;

  const pruneSignalReconnects = (timestamp: number) => {
    const cutoff = timestamp - options.signalReconnectWindowMs;
    signalReconnects = signalReconnects.filter(value => value >= cutoff);
  };

  const buildDecision = (reason: RelayRecoveryReason) => {
    if (relayRequested || now() < retryNotBefore) {
      return null;
    }

    relayRequested = true;
    return {
      reason,
      signalReconnectCount: signalReconnects.length,
      consecutiveHighRttSamples,
      maxRoundTripTimeMs: lastMaxRoundTripTimeMs
    } satisfies RelayRecoveryDecision;
  };

  return {
    recordSignalReconnect(): RelayRecoveryDecision | null {
      const timestamp = now();
      pruneSignalReconnects(timestamp);
      signalReconnects.push(timestamp);

      if (signalReconnects.length < options.signalReconnectThreshold) {
        return null;
      }

      return buildDecision('repeated-signal-reconnect');
    },

    recordStats(samples: RelayRecoverySample[]): RelayRecoveryDecision | null {
      const directRttValues = samples
        .filter(sample => sample.connectionPath === 'direct')
        .map(sample => sample.roundTripTimeMs)
        .filter((value): value is number => value !== null);

      lastMaxRoundTripTimeMs = directRttValues.length
        ? Math.max(...directRttValues)
        : null;

      if (
        lastMaxRoundTripTimeMs !== null &&
        lastMaxRoundTripTimeMs >= options.highRttThresholdMs
      ) {
        consecutiveHighRttSamples += 1;
      } else {
        consecutiveHighRttSamples = 0;
      }

      if (consecutiveHighRttSamples < options.highRttSampleThreshold) {
        return null;
      }

      return buildDecision('sustained-high-rtt');
    },

    markRelayFailed() {
      relayRequested = false;
      signalReconnects = [];
      consecutiveHighRttSamples = 0;
      lastMaxRoundTripTimeMs = null;
      retryNotBefore = now() + options.retryCooldownMs;
    },

    reset() {
      signalReconnects = [];
      consecutiveHighRttSamples = 0;
      lastMaxRoundTripTimeMs = null;
      relayRequested = false;
      retryNotBefore = 0;
    },

    snapshot() {
      const timestamp = now();
      pruneSignalReconnects(timestamp);
      return {
        signalReconnectCount: signalReconnects.length,
        consecutiveHighRttSamples,
        maxRoundTripTimeMs: lastMaxRoundTripTimeMs,
        relayRequested,
        retryCooldownRemainingMs: Math.max(0, retryNotBefore - timestamp)
      };
    }
  };
};
