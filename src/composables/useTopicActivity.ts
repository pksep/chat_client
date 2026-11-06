import { reactive, watch } from 'vue';
import { authedUser } from './useAuth';
import { getUserById } from './useUsers';
import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { getTypingIndicatorLabel } from '../utils/typingIndicator';
import {
  MESSAGE_UPLOAD_KINDS,
  getUploadIndicatorLabel,
  type MessageUploadActivity,
  type MessageUploadKind
} from '../utils/message-upload-activity';

const uploads = reactive(
  new Map<string, MessageUploadActivity & { userId: string }>()
);
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const UPLOAD_STATUS_TTL_MS = 4000;

export const clearTopicUploadStatuses = (): void => {
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
  uploads.clear();
};

export const setTopicUploadStatus = (activity: MessageUploadActivity): void => {
  if (
    !activity.topicId ||
    !activity.userId ||
    activity.userId === authedUser.value?.id ||
    !MESSAGE_UPLOAD_KINDS.includes(activity.kind) ||
    typeof activity.isUploading !== 'boolean'
  )
    return;
  const key = JSON.stringify([
    activity.topicId,
    activity.userId,
    activity.kind,
    activity.socketId || ''
  ]);
  clearTimeout(timers.get(key));
  timers.delete(key);
  if (!activity.isUploading) {
    uploads.delete(key);
    return;
  }
  uploads.set(key, { ...activity, userId: activity.userId });
  timers.set(
    key,
    setTimeout(() => {
      uploads.delete(key);
      timers.delete(key);
    }, UPLOAD_STATUS_TTL_MS)
  );
};

export const getTopicActivityLabel = (
  topic: ITopic | undefined,
  typingUsers: IUser[]
): string => {
  const typing = getTypingIndicatorLabel(topic?.type, typingUsers);
  if (typing || !topic) return typing;
  const sending: { user: IUser; kind: MessageUploadKind }[] = [];
  uploads.forEach(activity => {
    if (activity.topicId !== topic.id) return;
    const user =
      getUserById(activity.userId) ||
      topic.members?.find(member => member.id === activity.userId) ||
      (topic.user?.id === activity.userId ? topic.user : undefined) ||
      ({ id: activity.userId, initials: 'Пользователь' } as IUser);
    sending.push({ user, kind: activity.kind });
  });
  return getUploadIndicatorLabel(topic.type, sending);
};

watch(() => authedUser.value?.id, clearTopicUploadStatuses, { flush: 'sync' });
