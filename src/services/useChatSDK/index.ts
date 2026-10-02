import { bindIncomingChatEvents } from './incoming-events';
import {
  User,
  Topic,
  Group,
  Message,
  TopicSetting,
  Media
} from '@pksep/zod-shared-chat';

import {
  WebSocketEventType,
  WebSocketEventHandler,
  WebSocketEventPayloads
} from './websocketEvents';
import { Reqi } from '@pksep/reqi';
import io, { Socket } from 'socket.io-client';
import {
  SearchParams,
  PaginatedResponse,
  MessageStatus,
  CallHistoryResponse
} from './types';

import { ChatAuth, ChatAuthInterface } from './auth';
import { configureJsonReads } from './read-json';
import { ChatUser, ChatUserInterface } from './user';
import type {
  CustomBackgroundImage,
  CustomBackgroundKind
} from '../customBackgroundLibrary';
import type { UserStatusValue } from '../../utils/userStatus';
import { ChatTopic, ChatTopicInterface } from './topic';
import {
  ChatFolderApi,
  ChatFolderInterface,
  type ChatFolder,
  type ChatFolderScope,
  type CreateChatFolderPayload,
  type SaveChatFolderPayload
} from './chat-folder';
import {
  ChatMessage,
  ChatMessageInterface,
  type TopicAttachmentsOptions,
  type TopicAttachmentsPage
} from './message';
import { ChatGroup, ChatGroupInterface } from './group';
import { ChatMedia, ChatMediaInterface } from './media';
import { ChatWS, ChatWSInterface } from './ws';
import { ChatUtils, ChatUtilsInterface } from './utils';
import { ITopic } from '../../components/interfaces/interfaces';
import { getAuthToken } from '../../composables/useLogin';
import {
  isAuthError,
  redirectToAuthorization,
  tryRefreshErpSession,
  withErpRefreshOnAuthError
} from '../../composables/useAuth';
import { getConfig } from '../useConfig';
import { getVideoThumbnail } from '../../utils/mediaPreview';
import type { MediaPreviewDimensions } from '../../utils/mediaPreview';
import {
  createTelemetryTraceId,
  getFileTelemetryPayload,
  getTelemetryErrorPayload,
  recordTelemetryEvent
} from '../useTelemetry';
import {
  getPersistedMultipartUploadsForScope,
  MultipartUploadSession,
  MultipartUploadTransport,
  removePersistedMultipartUpload,
  removePersistedMultipartUploadByKey,
  shouldUseMultipartUpload,
  uploadMultipartFile
} from './multipart-upload';

export interface ChatSDKOptions {
  apiUrl: string;
  wsUrl: string;
  token?: string;
}

export interface WebSocketEvent {
  type: string;
  payload: any;
  timestamp?: Date;
}

const UPLOAD_RETRY_MAX_DELAY_MS = 5000;
const VIDEO_UPLOAD_COVER_TIMEOUT_MS = 8000;

interface UploadTarget {
  objectName: string;
  uploadUrl: string;
}

export interface UploadTelemetryContext {
  traceId?: string;
  topicId?: string;
  messageId?: string;
  fileId?: string;
  source?: string;
  signal?: AbortSignal;
}

export class ChatSDK {
  private apiUrl: string;
  private wsUrl: string;
  private token?: string;
  private socket: Socket | null = null;
  private removeIncomingChatEvents: (() => void) | null = null;
  private readonly multipartUploadAbortControllers = new Map<
    string,
    AbortController
  >();

  private auth: ChatAuthInterface;
  private user: ChatUserInterface;
  private topic: ChatTopicInterface;
  private chatFolder: ChatFolderInterface;
  private message: ChatMessageInterface;
  private group: ChatGroupInterface;
  private media: ChatMediaInterface;
  private ws: ChatWSInterface;
  private utils: ChatUtilsInterface;
  private connectionStateListener?: (connected: boolean) => void;

  private reqi: Reqi;

  constructor(options: ChatSDKOptions) {
    this.apiUrl = options.apiUrl;
    this.wsUrl = options.wsUrl;
    this.token = options.token;

    this.reqi = this.createReqiInstance();

    this.auth = new ChatAuth(this.apiUrl, this.token);
    this.user = new ChatUser(this.reqi);
    this.topic = new ChatTopic(this.reqi);
    this.chatFolder = new ChatFolderApi(this.reqi);
    this.message = new ChatMessage(this.reqi);
    this.group = new ChatGroup(this.reqi);
    this.media = new ChatMedia(this.reqi);
    this.ws = new ChatWS(null);
    this.utils = new ChatUtils(this.reqi);
  }

  setConnectionStateListener(listener?: (connected: boolean) => void): void {
    this.connectionStateListener = listener;
  }

  private emitConnectionState(connected: boolean): void {
    this.connectionStateListener?.(connected);
  }

  private createReqiInstance(): Reqi {
    const reqi = new Reqi(this.apiUrl, {
      headers: {
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    });

    reqi.request.use(async (request: Request): Promise<Request> => {
      const token = getAuthToken() || this.token;

      if (token) {
        request.headers.set('Authorization', `Bearer ${token}`);
      } else {
        request.headers.delete('Authorization');
      }

      return request;
    });

    const methodNames = ['get', 'post', 'put', 'patch', 'delete'] as const;

    for (const methodName of methodNames) {
      const originalMethod = (reqi as any)[methodName];

      if (typeof originalMethod !== 'function') {
        continue;
      }

      (reqi as any)[methodName] = (...args: any[]) => {
        return withErpRefreshOnAuthError(() =>
          originalMethod.apply(reqi, args)
        );
      };
    }

    configureJsonReads(reqi, () => getAuthToken() || this.token);
    return reqi;
  }

  private async readErrorResponse(
    response: Response,
    fallbackMessage: string
  ): Promise<string> {
    try {
      const contentType = response.headers.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const data = (await response.json()) as Record<string, unknown>;
        const message =
          typeof data?.message === 'string'
            ? data.message
            : Array.isArray(data?.message)
              ? data.message.filter(Boolean).join(', ')
              : typeof data?.error === 'string'
                ? data.error
                : null;

        if (message) {
          return `${response.status} ${message}`;
        }
      } else {
        const text = (await response.text()).trim();
        if (text) {
          return `${response.status} ${text}`;
        }
      }
    } catch {
      // Ignore response parsing errors and fall back to the default message.
    }

    return fallbackMessage;
  }

  private uploadFileToMinio(
    uploadUrl: string,
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open('PUT', uploadUrl);

      if (file.type) {
        xhr.setRequestHeader('Content-Type', file.type);
      }

      xhr.upload.onprogress = event => {
        if (!event.lengthComputable || event.total === 0) {
          return;
        }

        onProgress?.((event.loaded / event.total) * 100);
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve();
          return;
        }

        reject(new Error(`Failed to upload media to storage: ${xhr.status}`));
      };

      xhr.onerror = () => {
        reject(new Error('Failed to upload media to storage: network error'));
      };

      xhr.onabort = () => {
        reject(new Error('Failed to upload media to storage: upload aborted'));
      };

      xhr.send(file);
    });
  }

  private async createUploadTarget(
    file: File,
    isMedia = false,
    clientTraceId?: string
  ): Promise<UploadTarget> {
    const response = (await this.reqi.post<UploadTarget>(
      '/media/upload-target',
      {
        originName: file.name,
        size: file.size,
        contentType: file.type || undefined,
        isMedia,
        clientTraceId
      },
      {
        parsed: false
      }
    )) as any;

    return response.json();
  }

  private createMultipartUploadTransport(
    isMedia: boolean,
    clientTraceId?: string
  ): MultipartUploadTransport {
    const parseResponse = async <T>(response: any): Promise<T> =>
      response.json() as Promise<T>;

    return {
      init: async (file: File, signal?: AbortSignal) => {
        const response = await this.reqi.post(
          '/media/multipart/init',
          {
            originName: file.name,
            size: file.size,
            contentType: file.type || undefined,
            isMedia,
            clientTraceId
          },
          { parsed: false, requset: { signal } }
        );
        return parseResponse<MultipartUploadSession>(response);
      },
      status: async (uploadId: string, signal?: AbortSignal) => {
        const response = await this.reqi.get(
          `/media/multipart/${encodeURIComponent(uploadId)}/status`,
          { parsed: false, request: { signal } }
        );
        return parseResponse<MultipartUploadSession>(response);
      },
      uploadPart: async (session, partNumber, part, onPartProgress, signal) => {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const baseUrl = this.apiUrl.replace(/\/+$/, '');
          xhr.open(
            'PUT',
            `${baseUrl}/media/multipart/${encodeURIComponent(session.uploadId)}/parts/${partNumber}`
          );
          xhr.withCredentials = true;
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          const token = getAuthToken() || this.token;

          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }

          const abort = () => xhr.abort();
          signal?.addEventListener('abort', abort, { once: true });
          xhr.upload.onprogress = event => onPartProgress(event.loaded);
          xhr.onload = () => {
            signal?.removeEventListener('abort', abort);

            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
              return;
            }

            let code: string | undefined;

            try {
              const response = JSON.parse(xhr.responseText) as {
                code?: unknown;
              };
              code =
                typeof response.code === 'string' ? response.code : undefined;
            } catch {
              // Some proxies return a non-JSON error page. The status is still
              // enough for the regular, bounded retry policy.
            }

            reject(
              Object.assign(
                new Error(`Failed to upload multipart part: ${xhr.status}`),
                { status: xhr.status, code }
              )
            );
          };
          xhr.onerror = () => {
            signal?.removeEventListener('abort', abort);
            reject(new Error('Failed to upload multipart part: network error'));
          };
          xhr.onabort = () => {
            signal?.removeEventListener('abort', abort);
            const error = new Error('Multipart upload aborted');
            error.name = 'AbortError';
            reject(error);
          };
          xhr.send(part);
        });
      },
      complete: async (uploadId: string, signal?: AbortSignal) => {
        const response = await this.reqi.post(
          `/media/multipart/${encodeURIComponent(uploadId)}/complete`,
          {},
          { parsed: false, requset: { signal } }
        );
        return parseResponse(response);
      },
      abort: async (uploadId: string, signal?: AbortSignal) => {
        await this.reqi.delete(
          `/media/multipart/${encodeURIComponent(uploadId)}`,
          { parsed: false, request: { signal } }
        );
      }
    };
  }

  private async uploadVideoCoverImage(
    file: File,
    traceId?: string
  ): Promise<string | null> {
    const startedAt = Date.now();

    try {
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.video_cover.start',
        traceId,
        entityType: 'upload',
        payload: getFileTelemetryPayload(file)
      });

      const coverFile = await this.createVideoCoverFile(file);

      if (!coverFile) {
        recordTelemetryEvent({
          category: 'upload',
          name: 'upload.video_cover.skipped',
          level: 'warn',
          traceId,
          entityType: 'upload',
          payload: {
            ...getFileTelemetryPayload(file),
            elapsedMs: Date.now() - startedAt,
            reason: 'cover_not_created'
          }
        });
        return null;
      }

      const uploadTarget = await this.createUploadTarget(
        coverFile,
        false,
        traceId
      );
      await this.uploadFileToMinio(uploadTarget.uploadUrl, coverFile);

      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.video_cover.success',
        traceId,
        entityType: 'upload',
        payload: {
          ...getFileTelemetryPayload(coverFile),
          elapsedMs: Date.now() - startedAt
        }
      });

      return uploadTarget.objectName;
    } catch (error) {
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.video_cover.failed',
        level: 'warn',
        traceId,
        entityType: 'upload',
        payload: {
          ...getFileTelemetryPayload(file),
          elapsedMs: Date.now() - startedAt,
          ...getTelemetryErrorPayload(error)
        }
      });
      console.warn('[ChatSDK] Failed to upload video cover image:', error);
      return null;
    }
  }

  private async createVideoCoverFile(file: File): Promise<File | null> {
    const thumbnailDataUrl = await getVideoThumbnail(file, {
      timeoutMs: VIDEO_UPLOAD_COVER_TIMEOUT_MS
    });

    if (!thumbnailDataUrl) {
      return null;
    }

    return this.dataUrlToFile(
      thumbnailDataUrl,
      this.getVideoCoverFileName(file.name)
    );
  }

  private getVideoCoverFileName(fileName: string): string {
    const baseName = fileName.replace(/\.[^.]*$/, '') || 'video';

    return `${baseName}-cover.jpg`;
  }

  private dataUrlToFile(dataUrl: string, fileName: string): File | null {
    const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/);

    if (!match) {
      return null;
    }

    const mimeType = match[1] || 'image/jpeg';
    const isBase64 = Boolean(match[2]);
    const data = match[3] || '';
    const binaryString = isBase64 ? atob(data) : decodeURIComponent(data);
    const bytes = new Uint8Array(binaryString.length);

    for (let index = 0; index < binaryString.length; index += 1) {
      bytes[index] = binaryString.charCodeAt(index);
    }

    return new File([bytes], fileName, { type: mimeType });
  }

  private getImageDimensions(file: File): Promise<{
    width?: number;
    height?: number;
  }> {
    return new Promise(resolve => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight
        });
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({});
      };

      image.src = objectUrl;
    });
  }

  private getVideoDimensions(file: File): Promise<{
    width?: number;
    height?: number;
  }> {
    return new Promise(resolve => {
      const video = document.createElement('video');
      const objectUrl = URL.createObjectURL(file);

      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          width: video.videoWidth,
          height: video.videoHeight
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({});
      };

      video.src = objectUrl;
    });
  }

  private async getFileDimensions(file: File): Promise<{
    width?: number;
    height?: number;
  }> {
    if (file.type.startsWith('image/')) {
      return this.getImageDimensions(file);
    }

    if (file.type.startsWith('video/')) {
      return this.getVideoDimensions(file);
    }

    return {};
  }

  private getPreviewDimensions(dimensions: {
    width?: number;
    height?: number;
  }): {
    previewWidth?: number;
    previewHeight?: number;
  } {
    const PREVIEW_MAX_WIDTH = 265;
    const PREVIEW_MAX_HEIGHT = 300;
    const { width, height } = dimensions;

    if (!width || !height) {
      return {};
    }

    const scale = Math.min(
      PREVIEW_MAX_WIDTH / width,
      PREVIEW_MAX_HEIGHT / height,
      1
    );

    return {
      previewWidth: Math.round(width * scale),
      previewHeight: Math.round(height * scale)
    };
  }

  async probeConnection(timeoutMs = 8000): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const token = getAuthToken() || this.token;
      const baseUrl = this.apiUrl.replace(/\/$/, '');
      const response = await fetch(
        `${baseUrl}/topics?page=1&limit=1&_=${Date.now()}`,
        {
          cache: 'no-store',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          signal: controller.signal
        }
      );

      return response.status < 500;
    } catch (error) {
      console.warn('Chat HTTP health probe failed:', error);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let authReconnectAttempted = false;
      let isSettled = false;
      let initialConnectionTimeout: ReturnType<typeof setTimeout> | null = null;

      const clearInitialConnectionTimeout = () => {
        if (!initialConnectionTimeout) return;

        clearTimeout(initialConnectionTimeout);
        initialConnectionTimeout = null;
      };

      const resolveOnce = () => {
        if (isSettled) return;

        isSettled = true;
        clearInitialConnectionTimeout();
        resolve();
      };

      const rejectOnce = (error: unknown) => {
        if (isSettled) return;

        isSettled = true;
        clearInitialConnectionTimeout();
        reject(error);
      };

      try {
        console.info('Socket.IO: Initializing chat connection', {
          wsUrl: this.wsUrl
        });

        this.socket = io(this.wsUrl, {
          transports: ['websocket', 'polling'],
          tryAllTransports: true,
          auth: cb => {
            cb({
              token: getAuthToken() || this.token
            });
          },

          reconnection: true,
          reconnectionAttempts: Infinity,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          timeout: 30000
        });

        initialConnectionTimeout = setTimeout(() => {
          rejectOnce(
            new Error(
              `Socket.IO: Initial connection timed out for ${this.wsUrl}`
            )
          );
        }, 30000);

        this.ws.setSocket(this.socket);

        this.socket.on('connect', () => {
          authReconnectAttempted = false;
          this.emitConnectionState(true);
          recordTelemetryEvent({
            category: 'network',
            name: 'network.websocket.connected',
            entityType: 'websocket',
            payload: {
              socketId: this.socket?.id,
              transport: this.socket?.io?.engine?.transport?.name,
              wsUrl: this.wsUrl
            }
          });
          console.log('Socket.IO: Connected to chat server', {
            socketId: this.socket?.id,
            transport: this.socket?.io?.engine?.transport?.name,
            wsUrl: this.wsUrl
          });
          resolveOnce();
        });

        this.socket.on('connect_error', async error => {
          if (!authReconnectAttempted && isAuthError(error)) {
            authReconnectAttempted = true;

            const refreshed = await tryRefreshErpSession();

            if (refreshed?.token && this.socket) {
              this.token = refreshed.token;
              console.warn(
                'Socket.IO: Retrying initial connection after token refresh'
              );
              this.socket.connect();
              return;
            }

            redirectToAuthorization();
            rejectOnce(error);
            return;
          }

          console.error('Socket.IO: Connection error:', error, {
            wsUrl: this.wsUrl,
            transport: this.socket?.io?.engine?.transport?.name,
            readyState: this.socket?.io?.engine?.readyState
          });
          recordTelemetryEvent({
            category: 'network',
            name: 'network.websocket.connect_error',
            level: 'error',
            entityType: 'websocket',
            payload: {
              wsUrl: this.wsUrl,
              transport: this.socket?.io?.engine?.transport?.name,
              readyState: this.socket?.io?.engine?.readyState,
              ...getTelemetryErrorPayload(error)
            }
          });
          this.emitConnectionState(false);
        });

        this.socket.on('disconnect', reason => {
          this.emitConnectionState(false);
          recordTelemetryEvent({
            category: 'network',
            name: 'network.websocket.disconnected',
            level: 'warn',
            entityType: 'websocket',
            payload: {
              reason,
              transport: this.socket?.io?.engine?.transport?.name,
              readyState: this.socket?.io?.engine?.readyState
            }
          });
          console.log('Socket.IO: Disconnected from chat server:', {
            reason,
            transport: this.socket?.io?.engine?.transport?.name,
            readyState: this.socket?.io?.engine?.readyState
          });
        });

        this.socket.on('reconnect_attempt', attemptNumber => {
          this.emitConnectionState(false);
          recordTelemetryEvent({
            category: 'network',
            name: 'network.websocket.reconnect_attempt',
            level: 'warn',
            entityType: 'websocket',
            payload: {
              attemptNumber,
              wsUrl: this.wsUrl,
              transport: this.socket?.io?.engine?.transport?.name
            }
          });
          console.log(
            `Socket.IO: Attempting to reconnect (${attemptNumber})...`,
            {
              wsUrl: this.wsUrl,
              transport: this.socket?.io?.engine?.transport?.name
            }
          );
        });

        this.socket.on('reconnect', attemptNumber => {
          this.emitConnectionState(true);
          recordTelemetryEvent({
            category: 'network',
            name: 'network.websocket.reconnected',
            entityType: 'websocket',
            payload: {
              attemptNumber,
              socketId: this.socket?.id,
              transport: this.socket?.io?.engine?.transport?.name
            }
          });
          console.log(
            `Reconnected to chat server after ${attemptNumber} attempts`,
            {
              socketId: this.socket?.id,
              transport: this.socket?.io?.engine?.transport?.name
            }
          );
        });

        this.socket.on('reconnect_error', error => {
          this.emitConnectionState(false);
          recordTelemetryEvent({
            category: 'network',
            name: 'network.websocket.reconnect_error',
            level: 'error',
            entityType: 'websocket',
            payload: {
              wsUrl: this.wsUrl,
              transport: this.socket?.io?.engine?.transport?.name,
              readyState: this.socket?.io?.engine?.readyState,
              ...getTelemetryErrorPayload(error)
            }
          });
          console.error('Reconnection error:', error, {
            wsUrl: this.wsUrl,
            transport: this.socket?.io?.engine?.transport?.name,
            readyState: this.socket?.io?.engine?.readyState
          });
        });

        this.socket.on('reconnect_failed', () => {
          this.emitConnectionState(false);
          recordTelemetryEvent({
            category: 'network',
            name: 'network.websocket.reconnect_failed',
            level: 'error',
            entityType: 'websocket',
            payload: {
              wsUrl: this.wsUrl
            }
          });
          console.error('Reconnection failed after maximum attempts');
        });

        this.socket.io.on('error', error => {
          this.emitConnectionState(false);
          console.error('Socket.IO manager error:', error, {
            wsUrl: this.wsUrl
          });
        });

        this.socket.io.engine.on('upgrade', transport => {
          console.log('Socket.IO: Transport upgraded', {
            transport: transport.name
          });
        });

        this.socket.io.engine.on('close', reason => {
          this.emitConnectionState(false);
          console.warn('Socket.IO engine closed', {
            reason,
            transport: this.socket?.io?.engine?.transport?.name
          });
        });

        this.removeIncomingChatEvents?.();
        this.removeIncomingChatEvents = bindIncomingChatEvents(
          this.socket,
          event => {
            this.handleWebSocketEvent(event);
          }
        );
      } catch (error) {
        rejectOnce(error);
      }
    });
  }

  disconnect(): void {
    this.removeIncomingChatEvents?.();
    this.removeIncomingChatEvents = null;
    if (this.socket) {
      this.emitConnectionState(false);
      this.socket.disconnect();
      this.socket = null;
    }
  }

  private authenticate(token: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit('authenticate', { token });
    }
  }

  private handleWebSocketEvent(rawEvent: any): void {
    this.ws.handleWebSocketEvent(rawEvent);
  }

  subscribeToEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    this.ws.subscribeToEvent(type, handler);
  }

  unsubscribeFromEvent<T extends WebSocketEventType>(
    type: T,
    handler: WebSocketEventHandler<T>
  ): void {
    this.ws.unsubscribeFromEvent(type, handler);
  }

  sendWebSocketEvent<T extends WebSocketEventType>(
    type: T,
    payload: WebSocketEventPayloads[T]
  ): boolean {
    return this.ws.sendWebSocketEvent(type, payload);
  }

  sendWebSocketEventWithAck<T extends WebSocketEventType, R = unknown>(
    type: T,
    payload: WebSocketEventPayloads[T],
    timeoutMs?: number
  ): Promise<R> {
    return this.ws.sendWebSocketEventWithAck<T, R>(type, payload, timeoutMs);
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  reconnectIfNeeded(): void {
    if (!this.socket) {
      return;
    }

    if (!this.socket.connected) {
      console.info(
        'Socket.IO: Forcing reconnect after resume/visibility change'
      );
      this.socket.connect();
    }
  }

  async getUsers(params?: SearchParams): Promise<PaginatedResponse<User>> {
    return this.user.getUsers(params);
  }

  async createUser(userData: Partial<User>): Promise<User> {
    return this.user.createUser(userData);
  }

  async getUserProfile(userId: string): Promise<User> {
    return this.user.getUserProfile(userId);
  }

  async updateUserProfile(
    userId: string,
    profileData: Partial<User>
  ): Promise<User> {
    return this.user.updateUserProfile(userId, profileData);
  }

  async removeUserStatusPreset(status: UserStatusValue): Promise<User> {
    return this.user.removeUserStatusPreset(status);
  }

  getCustomBackgrounds(kind: CustomBackgroundKind) {
    return this.user.getCustomBackgrounds(kind);
  }

  getCustomBackground(kind: CustomBackgroundKind, id: string) {
    return this.user.getCustomBackground(kind, id);
  }

  saveCustomBackground(
    kind: CustomBackgroundKind,
    image: CustomBackgroundImage
  ) {
    return this.user.saveCustomBackground(kind, image);
  }

  deleteCustomBackground(kind: CustomBackgroundKind, id: string) {
    return this.user.deleteCustomBackground(kind, id);
  }

  async getRecentTopics(userId: string): Promise<Topic[]> {
    return this.user.getRecentTopics(userId);
  }

  async authenticateUser(credentials: {
    email: string;
    password: string;
  }): Promise<{ user: User; token: string }> {
    const result = await this.auth.authenticateUser(credentials);

    this.token = result.token;
    this.reqi = this.createReqiInstance();

    this.auth = new ChatAuth(this.apiUrl, this.token);

    return result;
  }

  async getTopics(): Promise<PaginatedResponse<ITopic>> {
    return this.topic.getTopics();
  }

  async getChatFolders(): Promise<ChatFolder[]> {
    return this.chatFolder.getChatFolders();
  }

  async createChatFolder(
    payload: CreateChatFolderPayload
  ): Promise<ChatFolder> {
    return this.chatFolder.createChatFolder(payload);
  }

  async updateChatFolder(
    folderId: string,
    payload: SaveChatFolderPayload
  ): Promise<ChatFolder> {
    return this.chatFolder.updateChatFolder(folderId, payload);
  }

  async deleteChatFolder(folderId: string): Promise<void> {
    return this.chatFolder.deleteChatFolder(folderId);
  }

  async reorderChatFolders(
    scope: ChatFolderScope,
    folderIds: string[]
  ): Promise<ChatFolder[]> {
    return this.chatFolder.reorderChatFolders(scope, folderIds);
  }

  async createTopic(topicData: { peerId: string }): Promise<Topic> {
    return await this.topic.createTopic(topicData);
  }

  async deleteTopic(topicId: string): Promise<void> {
    return await this.topic.deleteTopic(topicId);
  }

  async togglePinTopic(topicId: string): Promise<TopicSetting> {
    return await this.topic.togglePinTopic(topicId);
  }

  async toggleMuteTopic(topicId: string): Promise<TopicSetting> {
    return await this.topic.toggleMuteTopic(topicId);
  }

  async setTopicMarkedUnread(
    topicId: string,
    isMarkedUnread: boolean
  ): Promise<TopicSetting> {
    return await this.topic.setTopicMarkedUnread(topicId, isMarkedUnread);
  }

  async getTopicSettings(
    topicId: string,
    userId: string
  ): Promise<TopicSetting> {
    return await this.topic.getTopicSettings(topicId, userId);
  }

  async updateTopicSettings(
    topicId: string,
    userId: string,
    settings: Partial<TopicSetting>
  ): Promise<TopicSetting> {
    return await this.topic.updateTopicSettings(topicId, userId, settings);
  }

  async leaveTopic(topicId: string): Promise<void> {
    return await this.topic.leaveTopic(topicId);
  }

  async getTopicById(topicId: string): Promise<Topic> {
    return await this.topic.getTopicById(topicId);
  }

  async getTopicParticipants(topicId: string): Promise<User[]> {
    return await this.topic.getTopicParticipants(topicId);
  }

  async createDMWithUser(peerId: string): Promise<Topic> {
    return await this.topic.createDMWithUser(peerId);
  }

  async updateTopic(
    topicId: string,
    topicData: Partial<{
      title?: string;
      description?: string;
      avatarUrl?: string;
    }>
  ): Promise<Topic> {
    return await this.topic.updateTopic(topicId, topicData);
  }

  async joinTopic(topicId: string): Promise<void> {
    this.ws.sendWebSocketEvent(WebSocketEventType.JOIN_TOPIC, { topicId });
  }

  async createGroup(groupData: {
    title: string;
    description?: string;
    avatarUrl?: string;
    memberIds: string[];
    admins: string[];
  }): Promise<Group> {
    return await this.group.createGroup(groupData);
  }

  async deleteGroup(groupId: string): Promise<void> {
    return await this.group.deleteGroup(groupId);
  }

  async getGroup(
    groupId: string
  ): Promise<{ group: Group; members: PaginatedResponse<User> }> {
    const topic = await this.group.getGroup(groupId);
    return topic;
  }

  async updateGroup(
    groupId: string,
    groupData: Partial<{
      title: string;
      description?: string;
      avatarUrl?: string;
      memberIds: string[];
      admins: string[];
    }>
  ): Promise<Group> {
    return await this.group.updateGroup(groupId, groupData);
  }

  async leaveGroup(groupId: string): Promise<void> {
    return await this.group.leaveGroup(groupId);
  }

  async addGroupMembers(groupId: string, userIds: string[]): Promise<User[]> {
    return await this.group.addGroupMembers(groupId, userIds);
  }

  async removeGroupMember(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    const result = await this.group.removeGroupMember(groupId, userId);

    if (typeof result === 'number') {
      return { success: result > 0 };
    }
    return result;
  }

  async promoteToAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return await this.group.promoteToAdmin(groupId, userId);
  }

  async demoteFromAdmin(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    return await this.group.demoteFromAdmin(groupId, userId);
  }

  async addUsersToGroup(
    groupId: string,
    userIds: string[]
  ): Promise<{ success: boolean; addedMembers: User[] }> {
    return await this.group.addUsersToGroup(groupId, userIds);
  }

  async removeUserFromGroup(
    groupId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    const result = await this.group.removeUserFromGroup(groupId, userId);

    if (typeof result === 'number') {
      return { success: result > 0 };
    }
    return result;
  }

  async editGroup(
    groupId: string,
    groupData: Partial<{
      title: string;
      description?: string;
      avatarUrl?: string;
      memberIds: string[];
      admins: string[];
    }>
  ): Promise<Group> {
    return await this.group.editGroup(groupId, groupData);
  }

  async getMessages(
    topicId: string,
    opts?: {
      limit?: number;
      lastMessageId?: string;
      afterMessageId?: string;
      newMessages?: boolean;
      fresh?: boolean;
    }
  ): Promise<Message[]> {
    return await this.message.getMessages(topicId, opts);
  }

  async getTopicMedia(
    topicId: string,
    opts?: TopicAttachmentsOptions
  ): Promise<TopicAttachmentsPage> {
    return await this.message.getTopicMedia(topicId, opts);
  }

  async getTopicFiles(
    topicId: string,
    opts?: TopicAttachmentsOptions
  ): Promise<TopicAttachmentsPage> {
    return await this.message.getTopicFiles(topicId, opts);
  }

  async getPinnedMessages(topicId: string): Promise<Message[]> {
    return await this.message.getPinnedMessages(topicId);
  }

  async getCallHistory(opts?: {
    page?: number;
    limit?: number;
  }): Promise<CallHistoryResponse> {
    return await this.message.getCallHistory(opts);
  }

  async getAroundMessage(messageId: string): Promise<Message[]> {
    return await this.message.getAroundMessage(messageId);
  }

  async editMessage(
    topicId: string,
    messageId: string,
    content: string
  ): Promise<Message> {
    return await this.message.editMessage(topicId, messageId, content);
  }

  async deleteMessage(topicId: string, messageId: string): Promise<void> {
    return await this.message.deleteMessage(topicId, messageId);
  }

  async clearTopicHistory(topicId: string): Promise<void> {
    return await this.message.clearTopicHistory(topicId);
  }

  async toggleMessageReaction(
    topicId: string,
    messageId: string,
    emoji: string
  ): Promise<{ success: boolean }> {
    return await this.message.toggleMessageReaction(topicId, messageId, emoji);
  }

  async markMessagesAsRead(
    topicId: string,
    messageIds: string[],
    reachedEnd = false
  ): Promise<void> {
    this.socket.emit(WebSocketEventType.READ_MESSAGE, {
      messageIds,
      topicId,
      reachedEnd
    });
  }

  async uploadFile(
    file: File,
    previewMeta?: MediaPreviewDimensions,
    onProgress?: (percent: number) => void,
    isMedia = false,
    telemetry?: UploadTelemetryContext
  ): Promise<{
    objectName: string;
    thumbnailObjectName: string | null;
    ex?: {
      width?: number;
      height?: number;
      previewWidth?: number;
      previewHeight?: number;
    };
  }> {
    const traceId = telemetry?.traceId || createTelemetryTraceId('upload');
    const startedAt = Date.now();
    const basePayload = {
      ...getFileTelemetryPayload(file),
      isMedia,
      topicId: telemetry?.topicId,
      messageId: telemetry?.messageId,
      fileId: telemetry?.fileId,
      source: telemetry?.source
    };

    recordTelemetryEvent({
      category: 'upload',
      name: 'upload.start',
      traceId,
      entityType: 'upload',
      entityId: telemetry?.messageId || telemetry?.fileId,
      payload: basePayload
    });

    const usedMultipart = shouldUseMultipartUpload(file);
    const multipartPersistenceKey =
      usedMultipart && telemetry?.messageId && telemetry.fileId !== undefined
        ? `${telemetry.messageId}:${telemetry.fileId}`
        : undefined;
    const multipartAbortController = multipartPersistenceKey
      ? new AbortController()
      : null;
    const abortFromCaller = (): void => multipartAbortController?.abort();

    if (multipartPersistenceKey && multipartAbortController) {
      this.multipartUploadAbortControllers.set(
        multipartPersistenceKey,
        multipartAbortController
      );

      if (telemetry?.signal?.aborted) {
        multipartAbortController.abort();
      } else {
        telemetry?.signal?.addEventListener('abort', abortFromCaller, {
          once: true
        });
      }
    }
    let lastReportedUploadProgress = -1;
    const reportUploadProgress = (percent: number): void => {
      const normalizedPercent = Math.max(0, Math.min(100, Math.round(percent)));

      if (normalizedPercent <= lastReportedUploadProgress) {
        return;
      }

      lastReportedUploadProgress = normalizedPercent;
      onProgress?.(normalizedPercent);
    };
    reportUploadProgress(0);
    let currentUploadStep = 'start';

    try {
      const videoCoverObjectNamePromise =
        isMedia && file.type.startsWith('video/')
          ? this.uploadVideoCoverImage(file, traceId)
          : Promise.resolve(null);

      currentUploadStep = 'target';
      const targetStartedAt = Date.now();
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.target.start',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: basePayload
      });

      let uploadTarget: UploadTarget;

      if (usedMultipart) {
        currentUploadStep = 'multipart_upload';
        const { completed } = await uploadMultipartFile(
          file,
          this.createMultipartUploadTransport(isMedia, traceId),
          {
            onProgress: percent => {
              reportUploadProgress(percent);
            },
            persistenceKey: multipartPersistenceKey,
            signal: multipartAbortController?.signal || telemetry?.signal
          }
        );
        uploadTarget = {
          objectName: completed.objectName,
          uploadUrl: ''
        };
      } else {
        uploadTarget = await this.createUploadTarget(file, isMedia, traceId);
      }

      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.target.success',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: {
          ...basePayload,
          objectName: uploadTarget.objectName,
          elapsedMs: Date.now() - targetStartedAt
        }
      });

      currentUploadStep = 'storage_put';
      const minioStartedAt = Date.now();
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.storage_put.start',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: {
          ...basePayload,
          objectName: uploadTarget.objectName
        }
      });

      if (!usedMultipart) {
        await this.uploadFileToMinio(
          uploadTarget.uploadUrl,
          file,
          reportUploadProgress
        );
      }

      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.storage_put.success',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: {
          ...basePayload,
          objectName: uploadTarget.objectName,
          elapsedMs: Date.now() - minioStartedAt
        }
      });

      currentUploadStep = 'video_cover';
      const videoCoverObjectName = await videoCoverObjectNamePromise;
      currentUploadStep = 'complete';
      const completeStartedAt = Date.now();

      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.complete.start',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: {
          ...basePayload,
          objectName: uploadTarget.objectName,
          hasVideoCover: Boolean(videoCoverObjectName)
        }
      });

      const response = await this.completeMediaUpload(
        {
          objectName: uploadTarget.objectName,
          originName: file.name,
          size: file.size,
          contentType: file.type || undefined,
          width: previewMeta?.width,
          height: previewMeta?.height,
          previewWidth: previewMeta?.previewWidth,
          previewHeight: previewMeta?.previewHeight,
          thumbnailObjectName: videoCoverObjectName || undefined,
          isMedia,
          clientTraceId: traceId
        },
        telemetry?.signal
      );
      const data = await response.json();
      if (usedMultipart) {
        removePersistedMultipartUpload(file, multipartPersistenceKey);
      }
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.complete.success',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: {
          ...basePayload,
          objectName: data.objectName,
          thumbnailObjectName: data.thumbnailObjectName,
          elapsedMs: Date.now() - completeStartedAt
        }
      });

      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.success',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: {
          ...basePayload,
          objectName: data.objectName,
          totalElapsedMs: Date.now() - startedAt
        }
      });

      return {
        objectName: data.objectName,
        thumbnailObjectName: data.thumbnailObjectName,
        ex: data.ex
      };
    } catch (error) {
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.failed',
        level: 'error',
        traceId,
        entityType: 'upload',
        entityId: telemetry?.messageId || telemetry?.fileId,
        payload: {
          ...basePayload,
          failedStep: currentUploadStep,
          totalElapsedMs: Date.now() - startedAt,
          ...getTelemetryErrorPayload(error)
        }
      });
      throw error;
    } finally {
      telemetry?.signal?.removeEventListener('abort', abortFromCaller);

      if (
        multipartPersistenceKey &&
        this.multipartUploadAbortControllers.get(multipartPersistenceKey) ===
          multipartAbortController
      ) {
        this.multipartUploadAbortControllers.delete(multipartPersistenceKey);
      }
    }
  }

  async abortPendingMessageUploads(messageId: string): Promise<void> {
    if (!messageId) {
      return;
    }

    const scopePrefix = `${messageId}:`;

    this.multipartUploadAbortControllers.forEach((controller, scope) => {
      if (scope.startsWith(scopePrefix)) {
        controller.abort();
      }
    });

    const persistedUploads = getPersistedMultipartUploadsForScope(scopePrefix);

    await Promise.all(
      persistedUploads.map(async upload => {
        try {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 5000);

          try {
            await this.reqi.delete(
              `/media/multipart/${encodeURIComponent(upload.uploadId)}`,
              { parsed: false, request: { signal: controller.signal } }
            );
          } finally {
            window.clearTimeout(timeoutId);
          }
        } catch {
          // The server also expires unfinished multipart sessions. Removing
          // local state here prevents a user-deleted upload from resuming.
        } finally {
          removePersistedMultipartUploadByKey(upload.persistenceKey);
        }
      })
    );
  }

  async abortPendingFileUpload(
    messageId: string,
    fileId: string
  ): Promise<void> {
    if (!messageId || fileId === undefined || fileId === null) {
      return;
    }

    const scope = `${messageId}:${fileId}`;
    this.multipartUploadAbortControllers.get(scope)?.abort();
    const persistedUploads = getPersistedMultipartUploadsForScope(scope);

    await Promise.all(
      persistedUploads.map(async upload => {
        try {
          const controller = new AbortController();
          const timeoutId = window.setTimeout(() => controller.abort(), 5000);

          try {
            await this.reqi.delete(
              `/media/multipart/${encodeURIComponent(upload.uploadId)}`,
              { parsed: false, request: { signal: controller.signal } }
            );
          } finally {
            window.clearTimeout(timeoutId);
          }
        } catch {
          // Cleanup is also retried by the server expiry worker.
        } finally {
          removePersistedMultipartUploadByKey(upload.persistenceKey);
        }
      })
    );
  }

  private getUploadErrorStatus(error: unknown): number | undefined {
    const candidate = Number(
      (error as { status?: unknown; response?: { status?: unknown } })
        ?.status ??
        (error as { response?: { status?: unknown } })?.response?.status
    );

    if (Number.isSafeInteger(candidate)) {
      return candidate;
    }

    const message = error instanceof Error ? error.message : String(error);
    const matchedStatus = message.match(/\b([45]\d{2})\b/);
    return matchedStatus ? Number(matchedStatus[1]) : undefined;
  }

  private isTransientUploadError(error: unknown): boolean {
    if ((error as { name?: unknown })?.name === 'AbortError') {
      return false;
    }

    const status = this.getUploadErrorStatus(error);
    return (
      status === undefined ||
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status >= 500
    );
  }

  private waitForUploadRetry(
    attempt: number,
    signal?: AbortSignal
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        const error = new Error('Upload aborted');
        error.name = 'AbortError';
        reject(error);
        return;
      }

      const delay = Math.min(
        UPLOAD_RETRY_MAX_DELAY_MS,
        300 * 2 ** Math.min(attempt, 5)
      );
      const onAbort = (): void => {
        clearTimeout(timeoutId);
        const error = new Error('Upload aborted');
        error.name = 'AbortError';
        reject(error);
      };
      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, delay);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async completeMediaUpload(
    payload: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<any> {
    let attempt = 0;

    for (;;) {
      try {
        return (await this.reqi.post<Media>('/media/upload', payload, {
          parsed: false
        })) as any;
      } catch (error) {
        if (!this.isTransientUploadError(error)) {
          throw error;
        }

        await this.waitForUploadRetry(attempt, signal);
        attempt += 1;
      }
    }
  }

  async updateMessageStatus(
    messageId: string,
    status: MessageStatus
  ): Promise<{ success: boolean }> {
    return await this.message.updateMessageStatus(messageId, status);
  }

  async searchMessages(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Message & { topic: Topic }>> {
    return await this.utils.searchMessages(query, params);
  }

  async searchTopics(
    query: string,
    params?: SearchParams
  ): Promise<PaginatedResponse<Topic>> {
    return await this.utils.searchTopics(query, params);
  }

  async getUnreadCounts(): Promise<{
    totalUnread: number;
    topicsUnread: { [topicId: string]: number };
  }> {
    return await this.utils.getUnreadCounts();
  }

  getConfig() {
    return getConfig();
  }

  async getLiveKitToken(roomId: string): Promise<string | null> {
    try {
      const response = (await this.reqi.get<{ token: string }>(
        `/calls/livekit-token?roomId=${encodeURIComponent(roomId)}`,
        { parsed: false }
      )) as any;

      if (!response.ok) {
        throw new Error(
          await this.readErrorResponse(
            response,
            `Failed to fetch call token: ${response.status}`
          )
        );
      }

      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error(
        `[LiveKit] Failed to fetch call token for room ${roomId}:`,
        error
      );
      return null;
    }
  }

  async getLiveKitCallStatus(
    roomId: string,
    options: { includeRoomState?: boolean; inviteToken?: string } = {}
  ): Promise<{
    active: boolean;
    topicId?: string | null;
    startTime?: number | null;
    roomReady?: boolean;
    participantCount?: number;
    wasAnswered?: boolean;
    groupMode?: boolean;
    elapsedDurationMs?: number;
  } | null> {
    try {
      const queryParams = new URLSearchParams({ roomId });
      if (options.includeRoomState) {
        queryParams.set('includeRoomState', 'true');
      }
      if (options.inviteToken) {
        queryParams.set('invite', options.inviteToken);
      }

      const response = (await this.reqi.get<{
        active: boolean;
        topicId?: string | null;
        startTime?: number | null;
        roomReady?: boolean;
        participantCount?: number;
        wasAnswered?: boolean;
        groupMode?: boolean;
        elapsedDurationMs?: number;
      }>(`/calls/status?${queryParams.toString()}`, {
        parsed: false
      })) as any;
      return await response.json();
    } catch (error) {
      console.error('[LiveKit] Failed to fetch call status:', error);
      return null;
    }
  }

  async createGroupCallInvite(roomId: string): Promise<{
    inviteToken: string;
    roomId: string;
    topicId?: string | null;
  } | null> {
    try {
      const response = (await this.reqi.get<{
        invite: {
          inviteToken: string;
          roomId: string;
          topicId?: string | null;
        };
      }>(`/calls/invite-link?roomId=${encodeURIComponent(roomId)}`, {
        parsed: false
      })) as any;
      const data = await response.json();
      return data.invite || null;
    } catch (error) {
      console.error('[LiveKit] Failed to create invite link:', error);
      return null;
    }
  }

  async getGroupCallInvitePreview(
    roomId: string,
    inviteToken: string
  ): Promise<{
    roomId: string;
    topicId?: string | null;
    title: string;
    avatarUrl?: string | null;
    startTime?: number | null;
    elapsedDurationMs?: number;
    participantCount: number;
    members: User[];
  } | null> {
    try {
      const response = (await this.reqi.get<{
        preview: {
          roomId: string;
          topicId?: string | null;
          title: string;
          avatarUrl?: string | null;
          startTime?: number | null;
          elapsedDurationMs?: number;
          participantCount: number;
          members: User[];
        };
      }>(
        `/calls/invite-preview?roomId=${encodeURIComponent(roomId)}&invite=${encodeURIComponent(inviteToken)}`,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data.preview || null;
    } catch (error) {
      console.error('[LiveKit] Failed to fetch invite preview:', error);
      return null;
    }
  }

  async getInviteLiveKitToken(
    roomId: string,
    inviteToken: string
  ): Promise<string | null> {
    try {
      const response = (await this.reqi.get<{ token: string }>(
        `/calls/invite-livekit-token?roomId=${encodeURIComponent(roomId)}&invite=${encodeURIComponent(inviteToken)}`,
        { parsed: false }
      )) as any;
      const data = await response.json();
      return data.token;
    } catch (error) {
      console.error('[LiveKit] Failed to fetch invite call token:', error);
      return null;
    }
  }
}
