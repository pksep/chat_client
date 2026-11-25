import { validateAiAttachments } from './aiAttachmentLimits';

type DesktopAgentAttachment = {
  name: string;
  mimeType: string;
} & ({ text: string } | { blob: string });

const maxAttachmentBytes = 10 * 1024 * 1024;
const textDecoder = new TextDecoder('utf-8', { fatal: true });

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (): void => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Не удалось прочитать файл «' + file.name + '».'));
        return;
      }

      resolve(reader.result.slice(reader.result.indexOf(',') + 1));
    };
    reader.onerror = (): void =>
      reject(new Error('Не удалось прочитать файл «' + file.name + '».'));
    reader.readAsDataURL(file);
  });
}

async function prepareAttachment(file: File): Promise<DesktopAgentAttachment> {
  const name = file.name;
  const mimeType = file.type || 'application/octet-stream';
  const bytes = await file.arrayBuffer();

  try {
    const text = textDecoder.decode(bytes);
    if (!text.includes('\0'))
      return { name, mimeType: file.type || 'text/plain', text };
  } catch {
    // Для файлов с двоичным содержимым передаём исходные байты.
  }

  const blob = await readBase64(file);

  return { name, mimeType, blob };
}

export async function prepareDesktopAgentAttachments(
  files: File[]
): Promise<DesktopAgentAttachment[]> {
  validateAiAttachments(files);

  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > maxAttachmentBytes) {
    throw new Error(
      'Общий размер вложений для агента не должен превышать 10 МБ.'
    );
  }

  return Promise.all(files.map(prepareAttachment));
}
