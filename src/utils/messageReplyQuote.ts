const MAX_REPLY_QUOTE_TEXT_LENGTH = 500;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeReplyQuoteWhitespace = (value?: string | null): string =>
  (value || '').replace(/\s+/g, ' ').trim();

export const normalizeReplyQuoteText = (value?: string | null): string => {
  const normalized = normalizeReplyQuoteWhitespace(value);

  if (normalized.length <= MAX_REPLY_QUOTE_TEXT_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_REPLY_QUOTE_TEXT_LENGTH - 1).trimEnd()}…`;
};

export const parseMessageEx = (value?: unknown): Record<string, unknown> => {
  if (!value) {
    return {};
  }

  if (isPlainObject(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const getMessageReplyQuoteText = (messageEx?: unknown): string => {
  const quoteText = parseMessageEx(messageEx).replyQuoteText;

  return typeof quoteText === 'string'
    ? normalizeReplyQuoteText(quoteText)
    : '';
};

export const normalizeReplyQuoteOccurrenceIndex = (
  value: unknown
): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

export const getMessageReplyQuoteOccurrenceIndex = (
  messageEx?: unknown
): number | undefined =>
  normalizeReplyQuoteOccurrenceIndex(
    parseMessageEx(messageEx).replyQuoteOccurrenceIndex
  );

export const createMessageExWithQuote = (
  payload: Record<string, unknown>,
  existingEx?: unknown
): string =>
  JSON.stringify({
    ...parseMessageEx(existingEx),
    ...payload
  });
