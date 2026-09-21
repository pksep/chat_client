import { parseMessageEx } from './messageReplyQuote';

/** Источник берётся из метаданных канонического сообщения, а не из текущего фильтра. */
export function managerMessageChannel(ex: unknown): string {
  const channel = parseMessageEx(ex).managerChannel;
  return typeof channel === 'string' &&
    ['widget', 'vk', 'avito'].includes(channel)
    ? channel
    : '';
}

export function hasExternalMessageChannel(ex: unknown): boolean {
  return ['vk', 'avito'].includes(managerMessageChannel(ex));
}
