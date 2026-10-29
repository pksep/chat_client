import { watch, type Ref } from 'vue';
import { isIosWeb } from '../utils/ios-pwa-viewport';
import { snapshotFile } from '../utils/snapshot-file';
import { getUploadFileSizeError } from '../services/useChatSDK/multipart-upload';
import { showErrorNotification } from './useNotifications';

export function useIosPwaFilePicker(
  host: Ref<HTMLElement | null>,
  onFiles: (files: FileList, onlyMedia: boolean) => void | Promise<void>,
  validateFiles?: (files: File[]) => void
) {
  watch(
    host,
    (element, _previous, onCleanup) => {
      if (!element || !isIosWeb()) return;
      const pendingInputs = new Map<HTMLInputElement, () => Promise<void>>();
      let disposed = false;
      let resumeTimer: ReturnType<typeof setTimeout> | undefined;
      const recoverSelection = () => {
        clearTimeout(resumeTimer);
        if (document.hidden || disposed || !pendingInputs.size) return;
        const deadline = Date.now() + 10_000;
        const recover = () => {
          if (document.hidden || disposed || !pendingInputs.size) return;
          pendingInputs.forEach(read => void read());
          // После камеры files может появиться позже focus и первого кадра.
          if (Date.now() < deadline && pendingInputs.size)
            resumeTimer = setTimeout(recover, 100);
          else {
            pendingInputs.forEach((_read, input) => {
              if (!input.files?.length) {
                pendingInputs.delete(input);
                input.remove();
              }
            });
          }
        };
        recover();
      };
      const handleClick = (event: MouseEvent) => {
        if (!(event.target instanceof Element)) return;
        const trigger = event.target.closest('.attach-file-button');
        if (trigger) {
          // Штатный редактор фиксирует координаты относительно layout viewport.
          // Открываем тот же popover через обёртку, оставляя привязку CSS к скрепке.
          event.preventDefault();
          event.stopImmediatePropagation();
          if (element.querySelector('.emoji-picker--open')) {
            element.querySelector<HTMLElement>('.smile-button')?.click();
          }
          trigger
            .closest('.attach-file-popover')
            ?.querySelector<HTMLElement>('.popover-yui-kit__wrapper')
            ?.click();
          return;
        }
        const option = event.target.closest(
          '.attach-file-popover .popover-yui-kit__options__item'
        );
        const label = option?.textContent?.trim();
        if (label !== 'Фото или видео' && label !== 'Файл') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.hidden = true;
        const onlyMedia = label === 'Фото или видео';
        if (onlyMedia) input.accept = 'image/*,video/*';
        const cleanupInput = () => {
          pendingInputs.delete(input);
          if (!pendingInputs.size) clearTimeout(resumeTimer);
          input.remove();
        };
        let processing = false;
        const readSelection = async () => {
          if (disposed || processing || !input.files?.length) return;
          processing = true;
          try {
            const files = Array.from(input.files);
            const sizeError = files.map(getUploadFileSizeError).find(Boolean);
            if (sizeError) {
              showErrorNotification(sizeError);
              return;
            }
            try {
              validateFiles?.(files);
            } catch (error) {
              showErrorNotification(error);
              return;
            }
            const selection = new DataTransfer();
            for (const file of files) {
              selection.items.add(await snapshotFile(file));
              if (disposed) return;
            }
            if (!disposed) await onFiles(selection.files, onlyMedia);
          } catch {
            if (!disposed) {
              showErrorNotification(
                'Не удалось прочитать файл. Выберите его ещё раз.'
              );
            }
          } finally {
            cleanupInput();
          }
        };
        pendingInputs.set(input, readSelection);
        // WebKit может прислать пустой change/cancel до готовности снимка камеры.
        input.addEventListener('cancel', recoverSelection);
        input.addEventListener('input', readSelection);
        input.addEventListener('change', () => {
          if (input.files?.length) void readSelection();
          else recoverSelection();
        });
        // WebKit нужен input в документе и вызов прямо в пользовательском клике.
        element.append(input);
        option
          ?.closest('.popover-yui-kit')
          ?.querySelector<HTMLElement>('.popover-yui-kit__wrapper')
          ?.click();
        input.click();
      };
      element.addEventListener('click', handleClick, true);
      // После камеры WebKit может заполнить files без события change.
      window.addEventListener('focus', recoverSelection);
      window.addEventListener('pageshow', recoverSelection);
      document.addEventListener('visibilitychange', recoverSelection);
      onCleanup(() => {
        disposed = true;
        clearTimeout(resumeTimer);
        element.removeEventListener('click', handleClick, true);
        window.removeEventListener('focus', recoverSelection);
        window.removeEventListener('pageshow', recoverSelection);
        document.removeEventListener('visibilitychange', recoverSelection);
        pendingInputs.forEach((_read, input) => input.remove());
        pendingInputs.clear();
      });
    },
    { flush: 'post' }
  );
}
