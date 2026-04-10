import { nextTick, type Ref } from 'vue';
import {
  sendMessageChat,
  uploadFile
} from '../../../services/useChat';
import { generateUUID } from '../../../utils/generateUUID';
import { fileToDataURL } from '../../../utils/fileToDataURL';
import { showErrorNotification } from '../../../composables/useNotifications';
import {
  changeFileLoadingStatus,
  changeFileUploadPercent,
  deleteFileAfterLoading,
  addMessageToLocal,
  deleteMessageFromLocal,
  registerPendingOutgoingForwardBatch
} from '../../../services/useMessages';
import { MediaType, MediaTypeType } from '@pksep/zod-shared-chat';
import type { IMessage, IMedia } from '../../interfaces/interfaces';
import { RouteTypes } from '../../../composables/navigation/useUrlRouting';
import {
  calculatePreviewDimensions,
  getFileDimensions
} from '../../../utils/mediaPreview';

const MAX_HTML_LENGTH = 4000;
const FORWARD_TEXT_SEND_DELAY_MS = 250;

const createMessageEx = (
  payload: Record<string, string | number>,
  existingEx?: string
): string => {
  let parsedEx: Record<string, unknown> = {};

  if (existingEx) {
    try {
      parsedEx = JSON.parse(existingEx);
    } catch {
      parsedEx = {};
    }
  }

  return JSON.stringify({
    ...parsedEx,
    ...payload
  });
};

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
    forwardMessages: IMessage[];
    hideUnreadMarker: boolean;
  },
  authUser: Ref<any>,
  mastraResult: Ref<any>,
  scrollToBottom: () => void,
  clearSellectedMessage: () => void
) {
  const waitForPreviewMetrics = async (media?: IMedia): Promise<void> => {
    if (!media || media.type === MediaType.File) {
      return;
    }

    const timeoutMs = 3000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (media.ex?.previewWidth && media.ex?.previewHeight) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  const handleSend = async (taggedUserIds?: string[]): Promise<void> => {
    const rawText = inputText.value;
    const topicId = route.value.id;
    const routeType = route.value?.type;
    const replyMessageId = state.replyMessage?.id;
    const forwardMessages = state.forwardMessages;
    const hasForwardMessages = forwardMessages.length > 0;
    const hasMultipleForwardMessages = forwardMessages.length > 1;
    const forwardBatchId = hasMultipleForwardMessages ? generateUUID() : null;

    if (
      (!rawText.trim() || rawText.trim() === '<p></p>') &&
      !hasForwardMessages
    )
      return;

    inputText.value = '';

    if (state.editMessage) {
      await sendMessageChat({
        messageId: state.editMessage.id,
        topicId,
        text: rawText
      });
      state.editMessage = null;
      return;
    }

    const parts = splitHtmlByLength(rawText);

    /* ================= AI ROUTE ================= */
    if (routeType === RouteTypes.AI) {
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
    if (!topicId) {
      console.error('[ChatSDK] Cannot send message: no topic provided');
      return;
    }

    try {
      if (parts.length === 0 && hasForwardMessages) {
        for (const [index, forwardMessage] of forwardMessages.entries()) {
          const ex = createMessageEx(
            {
              clientId: generateUUID(),
              ...(forwardBatchId
                ? {
                    forwardBatchId,
                    forwardBatchOrder: index
                  }
                : {})
            },
            undefined
          );

          await sendMessageChat({
            topicId,
            text: '',
            replyMessageId,
            forwardMessageId: forwardMessage.id,
            ex
          });
        }
      }

      if (hasMultipleForwardMessages && parts.length > 0) {
        registerPendingOutgoingForwardBatch(
          topicId,
          [
            ...forwardMessages.map((_, index) => ({
              forwardBatchId: forwardBatchId as string,
              forwardBatchOrder: index
            })),
            ...parts.map((_, index) => ({
              forwardBatchId: forwardBatchId as string,
              forwardBatchOrder: forwardMessages.length + index
            }))
          ]
        );

        for (const [index, forwardMessage] of forwardMessages.entries()) {
          const ex = createMessageEx({
            clientId: generateUUID(),
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: index
          });

          await sendMessageChat({
            topicId,
            text: '',
            replyMessageId,
            forwardMessageId: forwardMessage.id,
            ex
          });
        }

        await new Promise(resolve =>
          setTimeout(resolve, FORWARD_TEXT_SEND_DELAY_MS)
        );

        for (const [index, part] of parts.entries()) {
          const ex = createMessageEx({
            clientId: generateUUID(),
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: forwardMessages.length + index
          });

          await sendMessageChat({
            topicId,
            text: part,
            replyMessageId,
            taggedUserIds,
            ex
          });
        }

        state.hideUnreadMarker = true;

        await nextTick();
        scrollToBottom();
        clearSellectedMessage();
        return;
      }

      for (const part of parts) {
        if (hasForwardMessages) {
          for (const forwardMessage of forwardMessages) {
            await sendMessageChat({
              topicId,
              text: part,
              replyMessageId,
              forwardMessageId: forwardMessage.id,
              taggedUserIds
            });
          }
          continue;
        }

        await sendMessageChat({
          topicId,
          text: part,
          replyMessageId,
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
    const topicId = route.value.id;
    const replyMessage = state.replyMessage;
    const replyMessageId = state.replyMessage?.id;
    const forwardMessages = state.forwardMessages;

    if (!topicId) {
      console.error('[ChatSDK] Cannot attach file: no topic provided');
      return;
    }

    const clientId = generateUUID();

    const localMedia: IMedia[] = await Promise.all(
      Array.from(files).map(async (file, i) => {
        const type = getMediaType(file, isMedia);
        const baseMedia = {
          localPath: await fileToDataURL(file),
          path: '',
          originName: file.name,
          size: file.size,
          id: i + '',
          createdAt: null,
          deletedAt: null,
          updatedAt: null,
          messageId: clientId,
          type,
          isLoading: true,
          uploadPercent: null
        };

        if (type === MediaType.File) {
          return {
            ...baseMedia,
            ex: {}
          };
        }

        const dimensions = await getFileDimensions(file);

        return {
          ...baseMedia,
          ex: calculatePreviewDimensions(dimensions, files.length, i)
        };
      })
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
      replyMessage,
      senderUserId: authUser.value.id,
      text: null,
      topicId,
      media: localMedia
    };

    addMessageToLocal(newMessage.topicId, newMessage);

    const medias = [];
    for (const [i, uploadedFile] of Array.from(files).entries()) {
      try {
        await waitForPreviewMetrics(localMedia[i]);
        const previewMeta = localMedia[i]?.ex;
        const { file, path, thumbnailPath, ex } = await uploadFile(
          uploadedFile,
          previewMeta,
          percent => {
            localMedia[i].uploadPercent = percent;
            changeFileUploadPercent(
              newMessage.topicId,
              clientId,
              i.toString(),
              percent
            );
          }
        );

        changeFileLoadingStatus(newMessage.topicId, clientId, i.toString());

        medias.push({
          path,
          thumbnailPath,
          originName: file.name,
          size: file.size,
          type: getMediaType(uploadedFile, isMedia),
          ex
        });
      } catch (error: any) {
        deleteFileAfterLoading(newMessage.topicId, clientId, i.toString());
        showErrorNotification(error.message || 'Failed to upload file');
      }
    }

    if (medias.length === 0) {
      deleteMessageFromLocal(newMessage.topicId, clientId);
      return;
    }

    try {
      if (forwardMessages.length > 0) {
        for (const forwardMessage of forwardMessages) {
          await sendMessageChat({
            topicId,
            text: '',
            medias,
            ex: JSON.stringify({ clientId }),
            replyMessageId,
            forwardMessageId: forwardMessage.id
          });
        }
      } else {
        await sendMessageChat({
          topicId,
          text: '',
          medias,
          ex: JSON.stringify({ clientId }),
          replyMessageId
        });
      }

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
