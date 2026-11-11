import { authedUser } from '../composables/useAuth';
import { getChatSDK, getHasWebsocketConnection } from './useChat';
import { WebSocketEventType } from './useChatSDK/websocketEvents';
import type { MessageUploadKind } from '../utils/message-upload-activity';

const activeUploads = new Map<
  string,
  { count: number; isCurrent: () => boolean; stop: () => void }
>();

export const startMessageUploadStatus = (
  topicId: string,
  kind: MessageUploadKind
): (() => void) => {
  const sdk = getChatSDK();
  const userId = authedUser.value?.id;
  if (!sdk || !userId) return () => {};
  const key = JSON.stringify([userId, topicId, kind]);
  let group = activeUploads.get(key);
  if (group && !group.isCurrent()) {
    group.stop();
    group = undefined;
  }
  if (!group) {
    const isCurrent = () =>
      getChatSDK() === sdk && authedUser.value?.id === userId;
    const emit = (isUploading: boolean) => {
      if (isCurrent() && getHasWebsocketConnection()) {
        sdk.sendWebSocketEvent(WebSocketEventType.UPLOAD_STATUS, {
          topicId,
          kind,
          isUploading
        });
      }
    };
    emit(true);
    const currentGroup = {
      count: 0,
      isCurrent,
      stop: () => {
        clearInterval(timer);
        emit(false);
        if (activeUploads.get(key) === currentGroup) activeUploads.delete(key);
      }
    };
    const timer = setInterval(() => {
      if (isCurrent()) emit(true);
      else currentGroup.stop();
    }, 2000);
    group = currentGroup;
    activeUploads.set(key, group);
  }
  group.count++;
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    group.count--;
    if (!group.count) group.stop();
  };
};
