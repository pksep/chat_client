import { shallowRef } from 'vue';

// Смена target перемещает существующие диалоги без unmount и отмены запроса доступа.
export const desktopOverlayTarget = shallowRef<string | HTMLElement>('body');
