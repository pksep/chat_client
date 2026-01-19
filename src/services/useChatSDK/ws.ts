import { Socket } from 'socket.io-client';
import { WsSubscribeMessage } from '@pksep/zod-shared-chat';
import {
  WebSocketEventType,
  WebSocketEvent,
  WebSocketEventHandler,
  WebSocketEventPayloads
} from './websocketEvents';

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
  ): void;
  handleWebSocketEvent(rawEvent: any): void;
  setSocket(socket: Socket): void;
}

export class ChatWS implements ChatWSInterface {
  private socket: Socket | null = null;
  private eventHandlers: Map<string, Array<(event: WebSocketEvent) => void>> =
    new Map();

  constructor(socket: Socket | null = null) {
    this.socket = socket;
  }

  setSocket(socket: Socket) {
    this.socket = socket;
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
  ): void {
    if (this.socket && this.socket.connected) {
      let serverEventType: string = type;

      switch (type) {
        case WebSocketEventType.SEND_MESSAGE:
          serverEventType = WsSubscribeMessage.SendMessage;
          break;
        case WebSocketEventType.EDIT_MESSAGE:
          serverEventType = 'editMessage';
          break;
        case WebSocketEventType.DELETE_MESSAGE:
          serverEventType = 'deleteMessage';
          break;
        case WebSocketEventType.TOGGLE_REACTION:
          serverEventType = 'toggleReaction';
          break;
        case WebSocketEventType.TOGGLE_PIN:
          serverEventType = 'togglePin';
          break;
        case WebSocketEventType.READ_MESSAGES:
          serverEventType = 'readMessages';
          break;
        case WebSocketEventType.JOIN_TOPIC:
          serverEventType = WsSubscribeMessage.JoinTopic;
          break;
        case WebSocketEventType.LEAVE_TOPIC:
          serverEventType = 'leaveTopic';
          break;
        default:
          serverEventType = type;
          break;
      }

      this.socket.emit(serverEventType, JSON.stringify(payload));
    } else {
      console.warn('Socket.IO is not connected. Cannot send event:', type);
    }
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
      handlers.forEach(handler => handler(event));
    } else {
      console.warn(`Unknown WebSocket event type: ${event.type}`);
    }
  }
}
