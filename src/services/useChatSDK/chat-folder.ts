import { Reqi } from '@pksep/reqi';
import { readJson } from './read-json';
import type { ChatWSInterface } from './ws';
import {
  WebSocketEventType,
  type WebSocketEventPayloads
} from './websocketEvents';

export interface ChatFolder {
  id: string;
  name: string;
  icon: ChatFolderIcon;
  scope?: ChatFolderScope;
  isSystem?: boolean;
  position?: number;
  topicIds: readonly string[];
  createdAt: string;
  updatedAt: string;
}

export const chatFolderIcons = [
  'folder',
  'smile',
  'star',
  'bookmark',
  'briefcase',
  'coffee',
  'flag',
  'heart',
  'settings',
  'soccer',
  'tag',
  'user',
  'book',
  'bell',
  'lightbulb',
  'robot',
  'paw',
  'car',
  'paint-brush',
  'phone',
  'home'
] as const;

export type ChatFolderIcon = (typeof chatFolderIcons)[number];
export type ChatFolderScope = 'chats' | 'clients';

export interface SaveChatFolderPayload {
  name?: string;
  icon?: ChatFolderIcon;
  topicIds?: string[];
}

export type CreateChatFolderPayload = SaveChatFolderPayload & {
  name: string;
  scope?: ChatFolderScope;
};

export type ChatFolderChange =
  | { kind: 'upsert'; folder: ChatFolder }
  | { kind: 'delete'; folderId: string }
  | { kind: 'reorder'; scope: ChatFolderScope; folders: ChatFolder[] };

type FolderAck<R> =
  | { success: true; data: R }
  | { success: false; error: string };
type FolderCommand =
  | WebSocketEventType.GET_CHAT_FOLDERS
  | WebSocketEventType.CREATE_CHAT_FOLDER
  | WebSocketEventType.UPDATE_CHAT_FOLDER
  | WebSocketEventType.DELETE_CHAT_FOLDER
  | WebSocketEventType.SET_CHAT_FOLDER_TOPIC
  | WebSocketEventType.REORDER_CHAT_FOLDERS;

export interface ChatFolderInterface {
  getChatFolders(): Promise<ChatFolder[]>;
  syncChatFolders(): Promise<ChatFolder[]>;
  setChatFolderTopic(
    folderId: string,
    topicId: string,
    included: boolean
  ): Promise<ChatFolder>;
  createChatFolder(payload: CreateChatFolderPayload): Promise<ChatFolder>;
  updateChatFolder(
    folderId: string,
    payload: SaveChatFolderPayload
  ): Promise<ChatFolder>;
  deleteChatFolder(folderId: string): Promise<void>;
  reorderChatFolders(
    scope: ChatFolderScope,
    folderIds: string[]
  ): Promise<ChatFolder[]>;
}

export class ChatFolderApi implements ChatFolderInterface {
  constructor(
    private readonly reqi: Reqi,
    private readonly ws: Pick<ChatWSInterface, 'sendWebSocketEventWithAck'>
  ) {}

  private async command<R, T extends FolderCommand = FolderCommand>(
    type: T,
    payload: WebSocketEventPayloads[T]
  ): Promise<R> {
    const response = await this.ws.sendWebSocketEventWithAck<T, FolderAck<R>>(
      type,
      payload
    );
    if (!response || response.success !== true) {
      throw new Error(
        response?.success === false
          ? response.error
          : 'Не удалось изменить папки'
      );
    }
    return response.data;
  }

  getChatFolders(): Promise<ChatFolder[]> {
    return readJson<ChatFolder[]>(this.reqi, '/chat-folders');
  }

  syncChatFolders(): Promise<ChatFolder[]> {
    return this.command(WebSocketEventType.GET_CHAT_FOLDERS, {});
  }

  setChatFolderTopic(
    folderId: string,
    topicId: string,
    included: boolean
  ): Promise<ChatFolder> {
    return this.command(WebSocketEventType.SET_CHAT_FOLDER_TOPIC, {
      folderId,
      topicId,
      included
    });
  }

  async createChatFolder(
    payload: CreateChatFolderPayload
  ): Promise<ChatFolder> {
    return this.command(WebSocketEventType.CREATE_CHAT_FOLDER, payload);
  }

  async updateChatFolder(
    folderId: string,
    payload: SaveChatFolderPayload
  ): Promise<ChatFolder> {
    return this.command(WebSocketEventType.UPDATE_CHAT_FOLDER, {
      ...payload,
      folderId
    });
  }

  async deleteChatFolder(folderId: string): Promise<void> {
    await this.command(WebSocketEventType.DELETE_CHAT_FOLDER, { folderId });
  }

  async reorderChatFolders(
    scope: ChatFolderScope,
    folderIds: string[]
  ): Promise<ChatFolder[]> {
    return this.command(WebSocketEventType.REORDER_CHAT_FOLDERS, {
      scope,
      folderIds
    });
  }
}
