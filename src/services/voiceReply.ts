/** Голос меняет только подачу ответа, права и подтверждения остаются штатными. */
export interface VoiceReplyOptions {
  interactionMode: 'voice';
  onText: (text: string) => void;
  onReset: () => void;
}

/** Ошибка звукового интерфейса не должна прерывать сохранение ответа или бизнес-запрос. */
export function notifyVoiceReply(
  voice: VoiceReplyOptions | undefined,
  text?: string
): void {
  try {
    if (text === undefined) voice?.onReset();
    else voice?.onText(text);
  } catch {
    // История и исходный запрос продолжают обрабатываться штатным путём.
  }
}
