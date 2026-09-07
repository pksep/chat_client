/**
 * Combines every message snapshot that can race during notification startup.
 * Later snapshots win for the same message, while messages absent from a
 * partial network page remain in the result.
 */
export const mergeNotificationMessageSnapshots = <T extends { id: string }>(
  ...snapshots: ReadonlyArray<ReadonlyArray<T>>
): T[] => {
  const merged: T[] = [];
  const indexesById = new Map<string, number>();

  snapshots.forEach(messages => {
    messages.forEach(message => {
      const existingIndex = indexesById.get(message.id);

      if (existingIndex === undefined) {
        indexesById.set(message.id, merged.length);
        merged.push(message);
        return;
      }

      merged[existingIndex] = message;
    });
  });

  return merged;
};

export const getNotificationVisibleMessagesLimit = <T extends { id: string }>(
  minimumLimit: number,
  ...snapshots: ReadonlyArray<ReadonlyArray<T>>
): number =>
  Math.max(
    minimumLimit,
    new Set(snapshots.flatMap(messages => messages.map(message => message.id)))
      .size
  );

const haveSharedMessage = <T extends { id: string }>(
  left: ReadonlyArray<T>,
  right: ReadonlyArray<T>
): boolean => {
  if (!left.length || !right.length) {
    return false;
  }

  const leftIds = new Set(left.map(message => message.id));
  return right.some(message => leftIds.has(message.id));
};

/**
 * Loads the range between a notification context and the authoritative latest
 * page. This closes the otherwise possible hole when the notification is old
 * enough that the two server snapshots no longer overlap.
 */
export const collectNotificationForwardPages = async <T extends { id: string }>(
  notificationContext: ReadonlyArray<T>,
  latestMessages: ReadonlyArray<T>,
  pageSize: number,
  fetchAfter: (messageId: string, limit: number) => Promise<ReadonlyArray<T>>
): Promise<T[][]> => {
  if (
    !notificationContext.length ||
    !latestMessages.length ||
    haveSharedMessage(notificationContext, latestMessages)
  ) {
    return [];
  }

  const latestMessageIds = new Set(latestMessages.map(message => message.id));
  const seenMessageIds = new Set(
    notificationContext.map(message => message.id)
  );
  const pages: T[][] = [];
  let cursorMessageId = notificationContext.at(-1)?.id || '';
  const normalizedPageSize = Math.max(1, pageSize);

  while (cursorMessageId) {
    const fetchedPage = Array.from(
      await fetchAfter(cursorMessageId, normalizedPageSize)
    );
    const reachedLatestPage = fetchedPage.some(message =>
      latestMessageIds.has(message.id)
    );
    const newMessages = fetchedPage.filter(
      message =>
        message.id !== cursorMessageId && !seenMessageIds.has(message.id)
    );

    if (newMessages.length === 0) {
      break;
    }

    pages.push(newMessages);
    newMessages.forEach(message => seenMessageIds.add(message.id));

    if (reachedLatestPage || fetchedPage.length < normalizedPageSize) {
      break;
    }

    const nextCursorMessageId = newMessages.at(-1)?.id || '';

    if (!nextCursorMessageId || nextCursorMessageId === cursorMessageId) {
      break;
    }

    cursorMessageId = nextCursorMessageId;
  }

  return pages;
};
