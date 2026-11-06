import type { ITopic, IUser } from '../components/interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';

export const MESSAGE_UPLOAD_KINDS = ['photo', 'video', 'file'] as const;
export type MessageUploadKind = (typeof MESSAGE_UPLOAD_KINDS)[number];
export interface MessageUploadActivity {
  topicId: string;
  userId?: string;
  socketId?: string;
  kind: MessageUploadKind;
  isUploading: boolean;
}

export const getMessageUploadKind = (
  file: Pick<File, 'type'>,
  isMedia: boolean
): MessageUploadKind => {
  if (isMedia && file.type.startsWith('image/')) return 'photo';
  if (isMedia && file.type.startsWith('video/')) return 'video';
  return 'file';
};

export const getUploadIndicatorLabel = (
  topicType: ITopic['type'] | undefined,
  uploads: { user: IUser; kind: MessageUploadKind }[]
): string => {
  if (!uploads.length) return '';
  const users = [
    ...new Map(uploads.map(item => [item.user.id, item.user])).values()
  ];
  const kinds = new Set(uploads.map(item => item.kind));
  const subject =
    kinds.size > 1
      ? 'файлы'
      : {
          photo: 'фото',
          video: 'видео',
          file: 'файл'
        }[uploads[0].kind];
  if (topicType !== TopicType.Group) return `Отправляет ${subject}`;
  if (users.length === 1) {
    const user = users[0];
    return `${user.initials || user.nickname || 'Пользователь'} отправляет ${subject}`;
  }
  const lastTwo = users.length % 100;
  const last = users.length % 10;
  const countLabel =
    lastTwo >= 11 && lastTwo <= 19
      ? 'пользователей'
      : last === 1
        ? 'пользователь'
        : last >= 2 && last <= 4
          ? 'пользователя'
          : 'пользователей';
  return `${users.length} ${countLabel} отправляют ${subject === 'файл' ? 'файлы' : subject}`;
};
