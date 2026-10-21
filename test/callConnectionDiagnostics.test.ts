import { expect, test } from 'bun:test';
import { createCallConnectionDiagnostics } from '../src/services/call-connection-diagnostics';

const createRoom = (sid: string) => ({
  name: 'livekit-test',
  state: 'connected',
  localParticipant: { sid }
});

test('позднее отключение старого Room сохраняет его SID и trace после замены соединения', () => {
  let id = 0;
  const diagnostics = createCallConnectionDiagnostics(() => `instance-${++id}`);
  const oldRoom = createRoom('PA_old');
  const newRoom = createRoom('PA_new');
  diagnostics.register(oldRoom, {
    attemptId: 1,
    connectReason: 'join-group-call',
    roomId: oldRoom.name,
    topicId: 'topic-old',
    traceId: 'trace-old'
  });
  diagnostics.snapshot(oldRoom, oldRoom);
  diagnostics.markDisconnectRequested(oldRoom, 'replace-room');
  diagnostics.register(newRoom, {
    attemptId: 2,
    connectReason: 'network-recovery:window-focus',
    roomId: newRoom.name,
    topicId: 'topic-new',
    traceId: 'trace-new'
  });
  oldRoom.state = 'disconnected';
  oldRoom.localParticipant.sid = '';

  expect(diagnostics.snapshot(oldRoom, newRoom)).toMatchObject({
    instanceId: 'instance-1',
    attemptId: 1,
    participantSid: 'PA_old',
    traceId: 'trace-old',
    topicId: 'topic-old',
    isCurrentRoom: false,
    currentRoomInstanceId: 'instance-2',
    disconnectRequestedBy: 'replace-room',
    roomState: 'disconnected'
  });
  expect(diagnostics.snapshot(newRoom, newRoom)).toMatchObject({
    participantSid: 'PA_new',
    traceId: 'trace-new',
    isCurrentRoom: true,
    disconnectRequestedBy: null
  });
});

test('переподключение SDK меняет SID внутри одного Room, не переписывая предыдущий снимок', () => {
  let now = 100;
  const diagnostics = createCallConnectionDiagnostics(
    () => 'instance',
    () => now
  );
  const room = createRoom('PA_before');
  diagnostics.register(room, {
    attemptId: 3,
    connectReason: 'direct-recovery',
    roomId: room.name,
    topicId: null,
    traceId: 'trace'
  });
  const beforeReconnect = diagnostics.snapshot(room, room);
  room.localParticipant.sid = 'PA_after';
  now = 900;
  expect(diagnostics.snapshot(room, room)).toMatchObject({
    instanceId: 'instance',
    participantSid: 'PA_after',
    ageMs: 800
  });
  room.localParticipant.sid = '';
  room.name = '';
  expect(diagnostics.snapshot(room, null)).toMatchObject({
    participantSid: 'PA_after',
    roomId: 'livekit-test',
    currentRoomInstanceId: null,
    isCurrentRoom: false
  });
  expect(beforeReconnect?.participantSid).toBe('PA_before');
});
