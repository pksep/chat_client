import type { ChatFolder } from '../services/useChatSDK/chat-folder';

export const sortChatFolders = (folders: readonly ChatFolder[]): ChatFolder[] =>
  [...folders].sort(
    (a, b) =>
      (a.position ?? 0) - (b.position ?? 0) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id)
  );

export const moveChatFolder = (
  folderIds: readonly string[],
  sourceId: string,
  targetId: string
): string[] => {
  const sourceIndex = folderIds.indexOf(sourceId);
  const targetIndex = folderIds.indexOf(targetId);
  const next = [...folderIds];
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex)
    return next;
  next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, sourceId);
  return next;
};
