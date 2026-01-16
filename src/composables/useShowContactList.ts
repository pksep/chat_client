export const isShowContactList = (
  chapter: string,
  id: string | null = null
): boolean =>
  chapter === 'assistant' ||
  (chapter === 'group' && id === null) ||
  (chapter === 'dialogs' && id === null);
