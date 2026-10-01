import { Reqi } from '@pksep/reqi';
import { readJson } from './read-json';

export interface ChatFolder {
  id: string;
  name: string;
  icon: ChatFolderIcon;
  scope?: ChatFolderScope;
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

export interface ChatFolderInterface {
  getChatFolders(): Promise<ChatFolder[]>;
  createChatFolder(payload: CreateChatFolderPayload): Promise<ChatFolder>;
  updateChatFolder(
    folderId: string,
    payload: SaveChatFolderPayload
  ): Promise<ChatFolder>;
  deleteChatFolder(folderId: string): Promise<void>;
}

export class ChatFolderApi implements ChatFolderInterface {
  constructor(private readonly reqi: Reqi) {}

  getChatFolders(): Promise<ChatFolder[]> {
    return readJson<ChatFolder[]>(this.reqi, '/chat-folders');
  }

  async createChatFolder(
    payload: CreateChatFolderPayload
  ): Promise<ChatFolder> {
    const response = (await this.reqi.post<ChatFolder>(
      '/chat-folders',
      payload,
      { parsed: false }
    )) as Response;

    return response.json();
  }

  async updateChatFolder(
    folderId: string,
    payload: SaveChatFolderPayload
  ): Promise<ChatFolder> {
    const response = (await this.reqi.patch<ChatFolder>(
      `/chat-folders/${folderId}`,
      payload,
      { parsed: false }
    )) as Response;

    return response.json();
  }

  async deleteChatFolder(folderId: string): Promise<void> {
    await this.reqi.delete(`/chat-folders/${folderId}`, { parsed: false });
  }
}
