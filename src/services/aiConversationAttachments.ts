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
import { extractAiOutputAttachments } from './aiOutputAttachments';

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
    ...extractAiOutputAttachments({
      chatAttachments: message.outputAttachments
    })
  ];
  const date = new Date(message.timestamp);

  return files.map(file => {
    const media = {
      id: file.id,
      messageId: message.id,
      path: file.path,
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
        forwardUserId: null,
        ex: '',
        media: [media]
      }
    };
  });
}

/** Страницы читаются из той же проверенной истории, что и сообщения ИИ. */
export function createAiAttachmentSource(
  info: AiConversationInfo,
  showInChat?: (messageId: string) => void
): ProfileAttachmentSource {
  return {
    key: `${info.ownerId}:${info.organizationId}:${info.threadId}:${info.generation}`,
    showInChat,
    load: async (tab, cursor): ReturnType<ProfileAttachmentSource['load']> => {
      const page = await fetchAiConversationMediaPage(
        info,
        cursor ? Number(cursor) : 0
      );
      const items = page.messages
        .flatMap(message => itemsForMessage(info, message))
        .filter(item =>
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
