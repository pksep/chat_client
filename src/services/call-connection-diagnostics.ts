type DiagnosticRoom = {
  name: string;
  state: string;
  localParticipant: { sid: string };
};

type ConnectionContext = {
  instanceId: string;
  attemptId: number;
  connectReason: string;
  roomId: string;
  topicId: string | null;
  traceId: string;
  createdAt: number;
  participantSid: string | null;
  disconnectRequestedBy: string | null;
  disconnectOperationId: string | null;
  disconnectRequestedAt: number | null;
  lifecycleEvents: CallLifecycleEvent[];
};

type CallLifecycleEvent = {
  name: string;
  at: number;
  details: Record<string, string | number | boolean | null>;
};

const MAX_LIFECYCLE_EVENTS = 20;
const DEFAULT_LIFECYCLE_WINDOW_MS = 15_000;

export const createCallConnectionDiagnostics = (
  createId: () => string,
  now = Date.now
) => {
  const connections = new WeakMap<DiagnosticRoom, ConnectionContext>();

  return {
    register(
      room: DiagnosticRoom,
      context: Pick<
        ConnectionContext,
        'attemptId' | 'connectReason' | 'roomId' | 'topicId' | 'traceId'
      > & { instanceId?: string }
    ) {
      connections.set(room, {
        ...context,
        instanceId: context.instanceId || createId(),
        createdAt: now(),
        participantSid: null,
        disconnectRequestedBy: null,
        disconnectOperationId: null,
        disconnectRequestedAt: null,
        lifecycleEvents: []
      });
    },
    markDisconnectRequested(
      room: DiagnosticRoom,
      reason: string,
      operationId: string
    ) {
      const context = connections.get(room);
      if (!context) return;

      context.disconnectRequestedBy = reason;
      context.disconnectOperationId = operationId;
      context.disconnectRequestedAt = now();
    },
    recordLifecycleEvent(
      room: DiagnosticRoom,
      name: string,
      details: CallLifecycleEvent['details'] = {}
    ) {
      const context = connections.get(room);
      if (!context) return;

      context.lifecycleEvents.push({ name, at: now(), details });
      if (context.lifecycleEvents.length > MAX_LIFECYCLE_EVENTS) {
        context.lifecycleEvents.splice(
          0,
          context.lifecycleEvents.length - MAX_LIFECYCLE_EVENTS
        );
      }
    },
    recentLifecycleEvents(
      room: DiagnosticRoom,
      windowMs = DEFAULT_LIFECYCLE_WINDOW_MS
    ) {
      const context = connections.get(room);
      if (!context) return [];

      const cutoff = now() - windowMs;
      return context.lifecycleEvents
        .filter(event => event.at >= cutoff)
        .map(event => ({
          ...event,
          ageMs: Math.max(0, now() - event.at)
        }));
    },
    snapshot(room: DiagnosticRoom | null, currentRoom: DiagnosticRoom | null) {
      const context = room ? connections.get(room) : undefined;
      if (!room || !context) return null;

      // SDK может очистить sid до Disconnected; сохраняем последний известный.
      if (room.localParticipant.sid) {
        context.participantSid = room.localParticipant.sid;
      }

      return {
        instanceId: context.instanceId,
        attemptId: context.attemptId,
        connectReason: context.connectReason,
        topicId: context.topicId,
        traceId: context.traceId,
        createdAt: context.createdAt,
        participantSid: context.participantSid,
        disconnectRequestedBy: context.disconnectRequestedBy,
        disconnectOperationId: context.disconnectOperationId,
        disconnectRequestedAt: context.disconnectRequestedAt,
        roomId: room.name || context.roomId,
        roomState: room.state,
        ageMs: Math.max(0, now() - context.createdAt),
        isCurrentRoom: room === currentRoom,
        currentRoomInstanceId: currentRoom
          ? connections.get(currentRoom)?.instanceId ?? null
          : null
      };
    }
  };
};
