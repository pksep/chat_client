import { watch, type Ref } from 'vue';
import { isIosWeb } from '../utils/ios-pwa-viewport';

export function useIosPwaFilePicker(
  host: Ref<HTMLElement | null>,
  onFiles: (files: FileList, onlyMedia: boolean) => void
) {
  watch(
    host,
    (element, _previous, onCleanup) => {
      if (!element || !isIosWeb()) return;
      let pendingInput: HTMLInputElement | undefined;
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
        pendingInput?.remove();
        const input = document.createElement('input');
        pendingInput = input;
        input.type = 'file';
        input.multiple = true;
        input.hidden = true;
        const onlyMedia = label === 'Фото или видео';
        if (onlyMedia) input.accept = 'image/*,video/*';
        input.addEventListener('change', () => {
          if (input.files?.length) onFiles(input.files, onlyMedia);
        });
        // WebKit нужен input в документе и вызов прямо в пользовательском клике.
        // Событие change проходит через штатную проверку ограничений вложений.
        element.append(input);
        option
          ?.closest('.popover-yui-kit')
          ?.querySelector<HTMLElement>('.popover-yui-kit__wrapper')
          ?.click();
        input.click();
      };
      element.addEventListener('click', handleClick, true);
      onCleanup(() => {
        element.removeEventListener('click', handleClick, true);
        pendingInput?.remove();
      });
    },
    { flush: 'post' }
  );
}
