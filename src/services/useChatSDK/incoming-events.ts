import type { Socket } from 'socket.io-client';
import { WebSocketEventType, type WebSocketEvent } from './websocketEvents';

const eventTypes = new Set<string>(Object.values(WebSocketEventType));
const aliases = new Map<string, WebSocketEventType>([
  ['joined', WebSocketEventType.JOIN_TOPIC],
  ['left', WebSocketEventType.LEAVE_TOPIC]
]);

/** Один вход для событий Socket.IO; пачка сообщений обновляет Vue один раз. */
export function bindIncomingChatEvents(
  socket: Pick<Socket, 'onAny' | 'offAny'>,
  dispatch: (event: WebSocketEvent) => void
): () => void {
  let pending: WebSocketEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deliver = (event: WebSocketEvent) => {
    try {
      dispatch(event);
    } catch (error) {
      console.error('Не удалось обработать входящее событие чата:', error);
    }
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    const batch = pending;
    pending = [];
    batch.forEach(deliver);
  };
  const listener = (name: string, payload: any) => {
    const type =
      aliases.get(name) ||
      (eventTypes.has(name) ? (name as WebSocketEventType) : null);
    if (!type) return;
    const event = { type, payload, timestamp: new Date() } as WebSocketEvent;
    if (
      type === WebSocketEventType.NEW_MESSAGE ||
      (type === WebSocketEventType.CHANGE_MESSAGE && payload?.type === 'NEW')
    ) {
      pending.push(event);
      if (pending.length >= 200) flush();
      else timer ??= setTimeout(flush, 16);
      return;
    }
    // Изменение, удаление и PTS должны видеть все предыдущие сообщения.
    flush();
    deliver(event);
  };
  socket.onAny(listener);
  return () => {
    socket.offAny(listener);
    clearTimeout(timer);
    timer = undefined;
    pending = [];
  };
}
