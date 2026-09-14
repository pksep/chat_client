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

/** Контекст нужен только для сообщения, которого нет ни в сети, ни в кеше. */
export const needsNotificationMessageContext = <T extends { id: string }>(
  messageId: string | undefined,
  ...snapshots: ReadonlyArray<ReadonlyArray<T>>
): boolean =>
  Boolean(messageId) &&
  !snapshots.some(messages =>
    messages.some(message => message.id === messageId)
  );
