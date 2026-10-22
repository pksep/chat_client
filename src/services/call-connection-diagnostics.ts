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
};

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
        disconnectRequestedBy: null
      });
    },
    markDisconnectRequested(room: DiagnosticRoom, reason: string) {
      const context = connections.get(room);
      if (context) context.disconnectRequestedBy = reason;
    },
    snapshot(room: DiagnosticRoom | null, currentRoom: DiagnosticRoom | null) {
      const context = room ? connections.get(room) : undefined;
      if (!room || !context) return null;

      // SDK может очистить sid до Disconnected; сохраняем последний известный.
      if (room.localParticipant.sid) {
        context.participantSid = room.localParticipant.sid;
      }

      return {
        ...context,
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
