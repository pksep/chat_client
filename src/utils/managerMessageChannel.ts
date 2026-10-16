import { parseMessageEx } from './messageReplyQuote';

export type ManagerMessageChannel =
  | 'widget'
  | 'vk'
  | 'avito'
  | 'telegram'
  | 'max';

export interface ManagerRoutedMessage {
  senderUserId?: string | null;
  ex?: unknown;
}

export interface ManagerReplyContext {
  routeId: string;
  channel: ManagerMessageChannel | '';
}

/** Источник берётся из метаданных канонического сообщения, а не из текущего фильтра. */
export function managerMessageChannel(ex: unknown): ManagerMessageChannel | '' {
  const channel = parseMessageEx(ex).managerChannel;

  return channel === 'widget' ||
    channel === 'vk' ||
    channel === 'avito' ||
    channel === 'telegram' ||
    channel === 'max'
    ? channel
    : '';
}

export function managerMessageRouteId(ex: unknown): string {
  const routeId = parseMessageEx(ex).managerReplyRouteId;

  return typeof routeId === 'string' ? routeId : '';
}

/** Последнее сообщение клиента определяет платформу и конкретный внешний диалог ответа. */
export function latestManagerReplyContext(
  messages: readonly ManagerRoutedMessage[],
  guestUserId?: string | null
): ManagerReplyContext | undefined {
  if (!guestUserId) {
    return undefined;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.senderUserId !== guestUserId) {
      continue;
    }

    const routeId = managerMessageRouteId(message.ex);

    if (routeId) {
      return {
        routeId,
        channel: managerMessageChannel(message.ex)
      };
    }
  }

  return undefined;
}

export function hasExternalMessageChannel(ex: unknown): boolean {
  return ['vk', 'avito', 'telegram', 'max'].includes(managerMessageChannel(ex));
}
