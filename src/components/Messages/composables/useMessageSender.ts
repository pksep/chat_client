import { nextTick, type Ref } from 'vue';
import { sendMessageChat, uploadFile } from '../../../services/useChat';
import { generateUUID } from '../../../utils/generateUUID';
import { fileToDataURL } from '../../../utils/fileToDataURL';
import {
  changeFileLoadingStatus,
  deleteFileAfterLoading,
  addMessageToLocal,
  deleteMessageFromLocal
} from '../../../services/useMessages';
import { MediaType, MediaTypeType } from '@pksep/zod-shared-chat';
import type { IMessage, IMedia } from '../../interfaces/interfaces';
import { RouteTypes } from '../../../composables/navigation/useUrlRouting';

const MAX_HTML_LENGTH = 2000;

export function splitHtmlByLength(
  html: string,
  maxLength = MAX_HTML_LENGTH
): string[] {
  const blocks = html.split(/(?=<p|<div|<br|<ul|<ol|<li)/i);
  const parts: string[] = [];

  let current = '';

  for (const block of blocks) {
    if ((current + block).length > maxLength) {
      if (current) parts.push(current);
      current = block;
    } else {
      current += block;
    }
  }

  if (current) parts.push(current);

  return parts;
}

export function getMediaType(file: File, isMedia: boolean): MediaTypeType {
  if (!isMedia) return MediaType.File;
  if (file.type.startsWith('image/')) return MediaType.Image;
  if (file.type.startsWith('video/')) return MediaType.Video;
  return MediaType.File;
}

export function useMessageSender(
  route: Ref<{ id: string; type: string }>,
  inputText: Ref<string>,
  state: {
    aiMessages: any[];
    editMessage: IMessage | null;
    replyMessage: IMessage | null;
    forwardMessage: IMessage | null;
    errorMessage: string;
    hideUnreadMarker: boolean;
  },
  authUser: Ref<any>,
  mastraResult: Ref<any>,
  scrollToBottom: () => void,
  clearSellectedMessage: () => void
) {
  const handleSend = async (taggedUserIds?: string[]): Promise<void> => {
    const rawText = inputText.value;

    if (
      (!rawText.trim() || rawText.trim() === '<p></p>') &&
      !state.forwardMessage
    )
      return;

    inputText.value = '';

    if (state.editMessage) {
      await sendMessageChat({
        messageId: state.editMessage.id,
        topicId: route.value.id,
        text: rawText
      });
      state.editMessage = null;
      return;
    }

    const parts = splitHtmlByLength(rawText);

    /* ================= AI ROUTE ================= */
    if (route.value?.type === RouteTypes.AI) {
      for (const part of parts) {
        const userMessage = {
          role: 'user' as 'user' | 'assistant',
          content: part,
          timestamp: Date.now()
        };

        state.aiMessages = [...state.aiMessages, userMessage];
        await nextTick();

        if (mastraResult.value?.sendMessage) {
          try {
            await mastraResult.value.sendMessage(part);
          } catch (error) {
            console.warn('Mastra failed to send message:', error);
            break;
          }
        } else {
          const assistantMessage = {
            role: 'assistant' as 'user' | 'assistant',
            content: 'Mastra is currently unavailable. Please try again later.',
            timestamp: Date.now()
          };

          state.aiMessages = [...state.aiMessages, assistantMessage];
          await nextTick();
          scrollToBottom();

          console.warn('Mastra is not available, message added locally only');
          break;
        }
      }

      state.hideUnreadMarker = true;
      return;
    }

    /* ================= NORMAL CHAT ================= */
    if (!route.value?.id) {
      console.error('[ChatSDK] Cannot send message: no topic provided');
      return;
    }

    try {
      if (parts.length === 0 && !!state.forwardMessage) {
        await sendMessageChat({
          topicId: route.value.id,
          text: '',
          replyMessageId: state.replyMessage?.id,
          forwardMessageId: state.forwardMessage?.id
        });
      }
      for (const part of parts) {
        await sendMessageChat({
          topicId: route.value.id,
          text: part,
          replyMessageId: state.replyMessage?.id,
          forwardMessageId: state.forwardMessage?.id,
          taggedUserIds
        });
      }
      state.hideUnreadMarker = true;

      await nextTick();
      scrollToBottom();
    } catch (error: any) {
      console.error('[ChatSDK] Failed to send message:', error);
    }

    clearSellectedMessage();
  };

  const handleAttachFileChunk = async (files: FileList, isMedia = false) => {
    if (!files.length) return;
    const clientId = generateUUID();

    const localMedia: IMedia[] = await Promise.all(
      Array.from(files).map(async (file, i) => ({
        localPath: await fileToDataURL(file),
        path: '',
        originName: file.name,
        size: file.size,
        id: i + '',
        createdAt: null,
        deletedAt: null,
        updatedAt: null,
        messageId: clientId,
        type: getMediaType(file, isMedia),
        isLoading: true
      }))
    );

    const newMessage: IMessage = {
      id: clientId,
      status: 'WAIT',
      createdAt: new Date(),
      deletedAt: null,
      updatedAt: null,
      isEdit: false,
      isPin: false,
      isSystem: false,
      replyMessageId: null,
      replyMessage: state.replyMessage,
      senderUserId: authUser.value.id,
      text: null,
      topicId: route.value.id,
      media: localMedia
    };

    addMessageToLocal(newMessage.topicId, newMessage);

    const medias = [];
    state.errorMessage = '';

    for (const [i, uploadedFile] of Array.from(files).entries()) {
      try {
        const { file, path, thumbnailPath } = await uploadFile(uploadedFile);

        changeFileLoadingStatus(newMessage.topicId, clientId, i.toString());

        medias.push({
          path,
          thumbnailPath,
          originName: file.name,
          size: file.size,
          type: getMediaType(uploadedFile, isMedia)
        });
      } catch (error: any) {
        deleteFileAfterLoading(newMessage.topicId, clientId, i.toString());
        state.errorMessage = error.message || 'Failed to upload file';
      }
    }

    if (medias.length === 0) {
      deleteMessageFromLocal(newMessage.topicId, clientId);
      return;
    }

    try {
      await sendMessageChat({
        topicId: route.value.id,
        text: '',
        medias,
        ex: JSON.stringify({ clientId }),
        replyMessageId: state.replyMessage?.id,
        forwardMessageId: state.forwardMessage?.id
      });

      await nextTick();
      scrollToBottom();
    } catch (error: any) {
      console.error('[ChatSDK] Failed to send message:', error);
    }

    state.replyMessage = null;
  };

  const handleAttachFile = async (files: FileList, isMedia = false) => {
    if (!files.length) return;

    const CHUNK_SIZE = 10;
    const filesArray = Array.from(files);

    for (let i = 0; i < filesArray.length; i += CHUNK_SIZE) {
      const chunk = filesArray.slice(i, i + CHUNK_SIZE);

      const chunkFileList = {
        length: chunk.length,
        item: (index: number) => chunk[index],
        ...chunk
      } as any as FileList;

      handleAttachFileChunk(chunkFileList, isMedia);
    }
  };

  return {
    handleSend,
    handleAttachFile
  };
}
