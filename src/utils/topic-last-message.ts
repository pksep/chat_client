export const resolveLastMessageAfterLocalSync = <T>(
  currentLastMessage: T | undefined,
  localLastMessage: T | undefined,
  hasKnownLocalState: boolean
): T | undefined =>
  hasKnownLocalState ? localLastMessage : currentLastMessage;
