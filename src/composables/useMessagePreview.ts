import { computed, watch } from 'vue';
import { ensureStickerMessageMetadata } from '../services/sticker-catalog';
import { getStickerApiBaseUrl } from '../utils/sticker-assets';
import { getStickerMessagePreview } from '../utils/stickers';
import { stripHtml } from '../utils/stripHtml';

export const useMessagePreview = (
  getMessage: () => { ex?: unknown; text?: string } | null | undefined
) => {
  watch(
    () => [getMessage()?.ex, getStickerApiBaseUrl()],
    ([ex]) => void ensureStickerMessageMetadata(ex),
    { immediate: true }
  );
  return computed(() => {
    const message = getMessage();
    return (
      getStickerMessagePreview(message?.ex, message?.text) ??
      stripHtml(message?.text || '')
    );
  });
};
