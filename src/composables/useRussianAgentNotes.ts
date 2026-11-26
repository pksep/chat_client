import { computed, ref, watch, type ComputedRef } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import {
  cachedRussianNote,
  needsRussianTranslation,
  noteKey,
  rememberRussianNote
} from '../services/agent-note-language';
import {
  getDesktopAgentChat,
  persistDesktopAgentMessages
} from './useDesktopAgentChats';

const pendingText = 'Перевожу пояснение…';
const unavailableText = 'Перевод пояснения пока недоступен';
const inFlight = new Map<string, Promise<void>>();

async function translate(threadId: string, sources: string[]): Promise<void> {
  const fresh = [...new Set(sources)].filter(text => {
    return (
      needsRussianTranslation(text) &&
      !cachedRussianNote(threadId, text) &&
      !inFlight.has(noteKey(threadId, text))
    );
  });

  let queue = Promise.resolve();
  for (let start = 0; start < fresh.length; start += 16) {
    const batch = fresh.slice(start, start + 16);
    queue = queue
      .then(async (): Promise<void> => {
        const items = await invoke<string[]>('desktop_agent_translate_notes', {
          threadId,
          texts: batch
        });
        batch.forEach((text, index) => {
          const value = items[index]?.trim();
          if (
            value &&
            /[а-яё]/i.test(value) &&
            !needsRussianTranslation(value)
          ) {
            rememberRussianNote(threadId, text, value);
          }
        });
      })
      .catch(() => undefined)
      .finally(() => {
        batch.forEach(text => inFlight.delete(noteKey(threadId, text)));
      });
    batch.forEach(text => inFlight.set(noteKey(threadId, text), queue));
  }

  await Promise.all(sources.map(text => inFlight.get(noteKey(threadId, text))));
  const chat = getDesktopAgentChat(threadId);
  if (!chat) return;
  let changed = false;
  for (const message of chat.messages) {
    for (const entry of message.workLog ?? []) {
      if (entry.kind === 'action') continue;
      const localized = cachedRussianNote(threadId, entry.text);
      if (localized && localized !== entry.text) {
        entry.text = localized;
        changed = true;
      }
    }
    const notes = message.reasoningSummaries;
    if (notes?.some(text => cachedRussianNote(threadId, text))) {
      message.reasoningSummaries = notes.map(
        text => cachedRussianNote(threadId, text) ?? text
      );
      changed = true;
    }
  }
  if (changed) await persistDesktopAgentMessages(chat).catch(() => undefined);
}

export function useRussianAgentNotes(
  threadId: () => string | null | undefined,
  notes: () => string[]
): ComputedRef<string[]> {
  const completed = ref(new Set<string>());
  watch(
    [threadId, notes],
    ([id, texts], _previous, cleanup) => {
      completed.value = new Set();
      if (!id || !texts.some(needsRussianTranslation)) return;
      let current = true;
      const timer = setTimeout(async (): Promise<void> => {
        try {
          await translate(id, texts);
        } finally {
          if (current) completed.value = new Set(texts);
        }
      }, 350);
      cleanup(() => {
        current = false;
        clearTimeout(timer);
      });
    },
    { immediate: true }
  );

  return computed<string[]>(() => {
    const settled = completed.value;
    return notes().map(text => {
      if (!needsRussianTranslation(text)) return text;
      return (
        cachedRussianNote(threadId() ?? '', text) ??
        (settled.has(text) ? unavailableText : pendingText)
      );
    });
  });
}
