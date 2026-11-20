import type { IMedia } from '../components/interfaces/interfaces';

type AttachmentKind = 'photo' | 'video' | 'audio' | 'document' | 'file';
const kindOf = (media: IMedia): AttachmentKind => {
  if (media.type === 'IMAGE') return 'photo';
  if (media.type === 'VIDEO') return 'video';
  const name = media.originName || '';
  if (/\.(?:mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i.test(name)) return 'audio';
  if (/\.(?:pdf|docx?|xlsx?|pptx?|odt|ods|rtf|txt|csv)$/i.test(name))
    return 'document';
  return 'file';
};
const names = {
  photo: ['Фото', 'фото', 'фото', 'фото'],
  video: ['Видео', 'видео', 'видео', 'видео'],
  audio: ['Аудиофайл', 'аудиофайл', 'аудиофайла', 'аудиофайлов'],
  document: ['Документ', 'документ', 'документа', 'документов'],
  file: ['Файл', 'файл', 'файла', 'файлов']
} as const;

export const getNotificationAttachmentPreview = (
  media: IMedia[] = []
): string => {
  if (!media.length) return '';
  if (media.length === 1) {
    const kind = kindOf(media[0]);
    const name = (media[0].originName || '').replace(/[\r\n\t]+/g, ' ').trim();
    return (
      names[kind][0] +
      (name && kind !== 'photo' && kind !== 'video'
        ? `: ${name.slice(0, 120)}`
        : '')
    );
  }
  const counts = new Map<AttachmentKind, number>();
  for (const item of media) {
    const kind = kindOf(item);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  }
  return Array.from(counts, ([kind, count]) => {
    const last = count % 10;
    const form =
      count % 100 >= 11 && count % 100 <= 14
        ? 3
        : last === 1
          ? 1
          : last >= 2 && last <= 4
            ? 2
            : 3;
    return `${count} ${names[kind][form]}`;
  }).join(', ');
};
