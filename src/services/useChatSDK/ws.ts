import { Socket } from 'socket.io-client';
import { WsSubscribeMessage } from '@pksep/zod-shared-chat';
import {
  WebSocketEventType,
  WebSocketEvent,
  WebSocketEventHandler,
  WebSocketEventPayloads
} from './websocketEvents';
import { recordTelemetryEvent } from '../useTelemetry';
import { parseMessageEx } from '../../utils/messageReplyQuote';

export interface ChatWSInterface {
  subscribeToEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void;
  unsubscribeFromEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void;
  sendWebSocketEvent<T extends WebSocketEventType>(
    type: T,
    payload: WebSocketEventPayloads[T]
  ): boolean;
  sendWebSocketEventWithAck<T extends WebSocketEventType, R = unknown>(
    type: T,
    payload: WebSocketEventPayloads[T],
    timeoutMs?: number
  ): Promise<R>;
  handleWebSocketEvent(rawEvent: any): void;
  setSocket(socket: Socket): void;
}

export class ChatWS implements ChatWSInterface {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Array<(event: WebSocketEvent) => void>> =
    new Map();
  private pendingEvents: Map<string, WebSocketEvent[]> = new Map();

  constructor(socket: Socket | null = null) {
    this.socket = socket;
  }

  setSocket(socket: Socket) {
    this.socket = socket;
  }

  private resolveServerEventType<T extends WebSocketEventType>(
    type: T
  ): string {
    switch (type) {
      case WebSocketEventType.SEND_MESSAGE:
        return WsSubscribeMessage.SendMessage;
      case WebSocketEventType.EDIT_MESSAGE:
        return 'editMessage';
      case WebSocketEventType.DELETE_MESSAGE:
        return 'deleteMessage';
      case WebSocketEventType.READ_MESSAGES:
        return 'readMessages';
      case WebSocketEventType.JOIN_TOPIC:
        return WsSubscribeMessage.JoinTopic;
      case WebSocketEventType.LEAVE_TOPIC:
        return 'leaveTopic';
      default:
        return type;
    }
  }

  subscribeToEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    if (!this.eventHandlers.has(type)) {
      this.eventHandlers.set(type, []);
    }

    const handlers = this.eventHandlers.get(type) as WebSocketEventHandler<T>[];
    handlers.push(handler as WebSocketEventHandler<any>);

    const pendingEvents = this.pendingEvents.get(type) || [];

    if (pendingEvents.length) {
      pendingEvents.forEach(event => {
        handler(event as WebSocketEvent<T>);
      });
      this.pendingEvents.delete(type);
    }
  }

  unsubscribeFromEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    if (this.eventHandlers.has(type)) {
      const handlers = this.eventHandlers.get(
        type
      ) as WebSocketEventHandler<T>[];
      const index = handlers.indexOf(handler as WebSocketEventHandler<any>);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  sendWebSocketEvent<T extends WebSocketEventType>(
    type: T,
    payload: WebSocketEventPayloads[T]
  ): boolean {
    if (this.socket && this.socket.connected) {
      this.socket.emit(
        this.resolveServerEventType(type),
        JSON.stringify(payload)
      );
      if (type === WebSocketEventType.SEND_MESSAGE) {
        const message =
          payload as WebSocketEventPayloads[WebSocketEventType.SEND_MESSAGE];
        const ex = parseMessageEx(message.ex);
        recordTelemetryEvent({
          category: 'chat',
          name: 'chat.message_send.emitted',
          entityType: 'topic',
          entityId: message.topicId,
          payload: {
            topicId: message.topicId,
            clientMessageId:
              typeof ex?.clientId === 'string' ? ex.clientId : undefined,
            socketId: this.socket.id,
            deliveryConfirmed: false
          }
        });
      }
      return true;
    } else {
      recordTelemetryEvent({
        category: 'network',
        name: 'network.websocket.emit_failed',
        level: 'error',
        entityType: 'websocket',
        payload: {
          eventType: type,
          reason: 'socket_not_connected'
        }
      });
      console.error('Socket.IO is not connected. Cannot send event:', type);
      return false;
    }
  }

  sendWebSocketEventWithAck<T extends WebSocketEventType, R = unknown>(
    type: T,
    payload: WebSocketEventPayloads[T],
    timeoutMs = 10000
  ): Promise<R> {
    if (!this.socket || !this.socket.connected) {
      recordTelemetryEvent({
        category: 'network',
        name: 'network.websocket.emit_failed',
        level: 'error',
        entityType: 'websocket',
        payload: {
          eventType: type,
          reason: 'socket_not_connected',
          requiresAck: true
        }
      });
      return Promise.reject(
        new Error(`Socket.IO is not connected. Cannot send event: ${type}`)
      );
    }

    return new Promise<R>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        recordTelemetryEvent({
          category: 'network',
          name: 'network.websocket.ack_timeout',
          level: 'error',
          entityType: 'websocket',
          payload: {
            eventType: type,
            timeoutMs
          }
        });
        reject(new Error(`Socket.IO ack timeout for event: ${type}`));
      }, timeoutMs);

      this.socket?.emit(
        this.resolveServerEventType(type),
        JSON.stringify(payload),
        (response: R) => {
          clearTimeout(timeoutId);
          resolve(response);
        }
      );
    });
  }

  handleWebSocketEvent(rawEvent: any): void {
    const eventType = rawEvent.type as WebSocketEventType;
    const event: WebSocketEvent = {
      type: eventType,
      payload: rawEvent.payload,
      timestamp: new Date(rawEvent.timestamp || Date.now())
    };

    if (
      Object.values(WebSocketEventType).includes(
        event.type as WebSocketEventType
      )
    ) {
      const handlers = this.eventHandlers.get(event.type) || [];

      if (!handlers.length) {
        const pendingEvents = this.pendingEvents.get(event.type) || [];
        pendingEvents.push(event);
        this.pendingEvents.set(event.type, pendingEvents.slice(-20));
        return;
      }

      handlers.forEach(handler => handler(event));
    } else {
      recordTelemetryEvent({
        category: 'network',
        name: 'network.websocket.unknown_event',
        level: 'warn',
        entityType: 'websocket',
        payload: {
          eventType: event.type
        }
      });
      console.warn(`Unknown WebSocket event type: ${event.type}`);
    }
  }
}
