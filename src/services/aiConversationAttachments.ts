import { MediaType } from '@pksep/zod-shared-chat';
import type {
  ProfileAttachmentSource,
  ProfileAttachmentItem
} from '../components/interfaces/profile-attachment-source';
import {
  fetchAiConversationMediaPage,
  type AiConversationInfo
} from './aiConversationInfo';
import type { AiTranscriptMessage } from './aiConversationTranscript';
import type { AiOutputAttachment } from './aiOutputAttachments';
import { normalizeAttachment } from './aiOutputAttachments';
import { getLocalAiMessageId, type AIMessage } from '../types/messages';

type AttachmentMessage = Pick<
  AiTranscriptMessage,
  'id' | 'role' | 'timestamp' | 'content' | 'pinned'
>;

type GalleryFile = AiOutputAttachment & { localPath?: string };

function itemsForMessage(
  info: AiConversationInfo,
  message: AiTranscriptMessage
): ProfileAttachmentItem[] {
  const files: AiOutputAttachment[] = [
    ...message.attachments.map(file => ({
      id: file.attachmentId,
      name: file.name,
      size: file.size,
      contentType: file.contentType,
      path: `ai-input/${file.attachmentId}`,
      thumbnailPath: file.contentType.startsWith('image/')
        ? `ai-input/${file.attachmentId}/preview`
        : null
    })),
    ...message.outputAttachments
      .map(normalizeAttachment)
      .filter(file => file !== null)
  ];

  return files.map(file => attachmentItem(info, message, file));
}

function attachmentItem(
  info: Pick<AiConversationInfo, 'threadId' | 'ownerId'>,
  message: AttachmentMessage,
  file: GalleryFile
): ProfileAttachmentItem {
  const date = new Date(message.timestamp);
  const media = {
    id: file.id,
    messageId: message.id,
    path: file.path,
    localPath: file.localPath,
    thumbnailPath:
      file.thumbnailPath ||
      (file.contentType.startsWith('image/') ? file.path : ''),
    originName: file.name,
    size: file.size,
    type: file.contentType.startsWith('image/')
      ? MediaType.Image
      : file.contentType.startsWith('video/')
        ? MediaType.Video
        : MediaType.File,
    createdAt: date,
    updatedAt: date,
    deletedAt: null
  };

  return {
    key: `${message.id}:${file.id}`,
    media,
    message: {
      id: message.id,
      topicId: info.threadId,
      senderUserId:
        message.role === 'user'
          ? info.ownerId
          : '00000000-0000-0000-0000-000000000000',
      text: message.content,
      createdAt: date,
      updatedAt: date,
      deletedAt: null,
      isEdit: false,
      isPin: message.pinned || false,
      isSystem: false,
      status: 'READ',
      replyMessageId: null,
      ex: '',
      media: [media]
    }
  };
}

/** Локальные диалоги читают те же сохранённые сообщения, что и сама переписка. */
export function createAgentAttachmentSource(
  threadId: string,
  ownerId: string,
  messages: AIMessage[],
  fileUrl: (file: File) => string,
  showInChat: (messageId: string) => void
): ProfileAttachmentSource {
  const items: ProfileAttachmentItem[] = [];
  const projectPaths = new Map<string, string>();
  const info = { threadId, ownerId };
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (
      !message.localFiles?.length &&
      !message.projectFiles?.length &&
      !message.outputAttachments?.length
    )
      continue;
    const entry = {
      id: message.id ?? getLocalAiMessageId(threadId, message, index),
      role: message.role,
      timestamp: message.timestamp ?? 0,
      content: message.content,
      pinned: message.pinned
    };
    const archivedPaths = new Set<string>();
    const photoCopies = new Set<string>();
    for (const [index, { file, projectPath, previewId }] of (
      message.localFiles ?? []
    ).entries()) {
      const id = `${entry.id}:local:${index}`;
      if (projectPath) {
        archivedPaths.add(projectPath);
        projectPaths.set(id, projectPath);
        if (previewId && file.type !== 'image/svg+xml')
          photoCopies.add(previewId);
      }
      items.push(
        attachmentItem(info, entry, {
          id,
          name: file.name,
          size: file.size,
          contentType:
            file.type === 'image/svg+xml'
              ? 'application/octet-stream'
              : file.type,
          path: '',
          localPath: fileUrl(file)
        })
      );
    }
    const uploaded = message.outputAttachments ?? [];
    for (const file of uploaded) {
      if (!photoCopies.has(file.id))
        items.push(attachmentItem(info, entry, file));
    }
    for (const [index, file] of (message.projectFiles ?? []).entries()) {
      if (archivedPaths.has(file.path)) continue;
      const name = file.relativePath.split(/[\\/]/).at(-1) || file.relativePath;
      const photo = uploaded.find(item => item.name === name);
      if (photo) {
        projectPaths.set(photo.id, file.path);
        continue;
      }
      const id = `${entry.id}:project:${index}`;
      projectPaths.set(id, file.path);
      items.push(
        attachmentItem(info, entry, {
          id,
          name,
          size: 0,
          contentType: 'application/octet-stream',
          path: ''
        })
      );
    }
  }

  return {
    key: `desktop-agent:${ownerId}:${threadId}`,
    showInChat,
    projectPath: media => projectPaths.get(media.id),
    load: async (tab, cursor): ReturnType<ProfileAttachmentSource['load']> => {
      const matching = items.filter(
        item => (item.media.type === MediaType.File) === (tab === 'files')
      );
      const start = Number(cursor ?? 0);
      const next = start + 50;

      return {
        items: matching.slice(start, next),
        hasMore: next < matching.length,
        nextCursor: next < matching.length ? String(next) : null
      };
    }
  };
}

interface AttachmentHistoryPage {
  items: ProfileAttachmentItem[];
  nextCursor: number | null;
}

/** Страницы читаются из той же проверенной истории, что и сообщения ИИ. */
export function createAiAttachmentSource(
  info: AiConversationInfo,
  showInChat?: (messageId: string) => void
): ProfileAttachmentSource {
  const pages = new Map<number, Promise<AttachmentHistoryPage>>();

  function getPage(after: number): Promise<AttachmentHistoryPage> {
    const existing = pages.get(after);
    if (existing) return existing;

    const request = fetchAiConversationMediaPage(info, after)
      .then(
        ({ messages, nextCursor }): AttachmentHistoryPage => ({
          items: messages.flatMap(message => itemsForMessage(info, message)),
          nextCursor
        })
      )
      .catch((error: unknown): never => {
        pages.delete(after);
        throw error;
      });
    pages.set(after, request);

    return request;
  }

  return {
    key: `${info.ownerId}:${info.organizationId}:${info.threadId}:${info.generation}`,
    showInChat,
    load: async (tab, cursor): ReturnType<ProfileAttachmentSource['load']> => {
      const page = await getPage(cursor ? Number(cursor) : 0);
      const items = page.items.filter(item =>
        tab === 'media'
          ? item.media.type !== MediaType.File
          : item.media.type === MediaType.File
      );

      return {
        items,
        nextCursor: page.nextCursor === null ? null : String(page.nextCursor),
        hasMore: page.nextCursor !== null
      };
    }
  };
}
