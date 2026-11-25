import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import type { AgentProjectFile } from '../types/messages';
import type { AiOutputAttachment } from './aiOutputAttachments';
import {
  calculatePreviewDimensions,
  getImageDimensions
} from '../utils/mediaPreview';
import { generateUUID } from '../utils/generateUUID';
import { showErrorNotification } from '../composables/useNotifications';

const imageTypes: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  bmp: 'image/bmp'
};

export async function revealAgentFile(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch {
    showErrorNotification(
      'Не удалось показать файл в папке. Возможно, его переместили или удалили.'
    );
  }
}

async function svgPhoto(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      4096 / Math.max(image.naturalWidth, image.naturalHeight)
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить рисунок.');

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        value =>
          value
            ? resolve(value)
            : reject(new Error('Не удалось подготовить фото.')),
        'image/png'
      )
    );
    return new File([blob], file.name.replace(/\.svg$/i, '.png'), {
      type: 'image/png'
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function agentPhotoType(item: AgentProjectFile): string | undefined {
  const extension = /\.([a-z0-9]+)$/i
    .exec(item.relativePath)?.[1]
    .toLowerCase();
  return !item.linkOnly && extension && Object.hasOwn(imageTypes, extension)
    ? imageTypes[extension]
    : undefined;
}

export async function readAgentOutput(
  threadId: string,
  item: AgentProjectFile
): Promise<File> {
  const name = item.path.split(/[\\/]/).at(-1) || '';
  const imageType = agentPhotoType(item);
  const videoTypes: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mov: 'video/quicktime',
    m4v: 'video/mp4'
  };
  const type =
    imageType ??
    videoTypes[name.split('.').at(-1)?.toLowerCase() ?? ''] ??
    'application/octet-stream';
  const bytes = await invoke<ArrayBuffer>(
    imageType ? 'desktop_agent_read_image' : 'desktop_agent_read_output',
    {
      threadId,
      path: item.path
    }
  );
  if (!(bytes instanceof ArrayBuffer))
    throw new Error('Не удалось прочитать файл проекта.');

  return new File([bytes], name, { type });
}

export async function uploadAgentPhoto(
  source: File
): Promise<AiOutputAttachment> {
  const file =
    source.type === 'image/svg+xml' ? await svgPhoto(source) : source;
  const dimensions = await getImageDimensions(file);
  if (!dimensions.width || !dimensions.height)
    throw new Error('Не удалось прочитать изображение.');

  const { uploadFile } = await import('./useChat');
  const result = await uploadFile(
    file,
    calculatePreviewDimensions(dimensions, 1, 0),
    undefined,
    true
  );
  return {
    id: generateUUID(),
    name: file.name,
    size: file.size,
    contentType: file.type,
    path: result.path,
    thumbnailPath: result.thumbnailPath
  };
}
