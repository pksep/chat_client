import { watch, type Ref } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { readTauriFiles } from '../services/tauri-upload-files';
import { showErrorNotification } from './useNotifications';

export function useTauriFilePicker(
  host: Ref<HTMLElement | null>,
  onFiles: (files: File[], onlyMedia: boolean) => void,
  canAttach: () => boolean,
  getContextKey: () => string
) {
  watch(
    host,
    (element, _previous, onCleanup) => {
      if (!element || !isTauri()) return;
      let disposed = false;
      let selecting = false;
      const selectFiles = async (onlyMedia: boolean) => {
        if (selecting || !canAttach()) return;
        const context = getContextKey();
        selecting = true;
        try {
          const paths = await invoke<string[]>('desktop_file_pick', {
            onlyMedia
          });
          if (disposed || !canAttach() || context !== getContextKey()) return;
          const files = await readTauriFiles(paths);
          if (
            !disposed &&
            canAttach() &&
            context === getContextKey() &&
            files.length
          )
            onFiles(files, onlyMedia);
        } catch (error) {
          if (!disposed) showErrorNotification(error);
        } finally {
          selecting = false;
        }
      };
      const handleClick = (event: MouseEvent) => {
        if (!(event.target instanceof Element)) return;
        const option = event.target.closest(
          '.attach-file-popover .popover-yui-kit__options__item'
        );
        const label = option?.textContent?.trim();
        if (label !== 'Фото или видео' && label !== 'Файл') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        option
          ?.closest('.popover-yui-kit')
          ?.querySelector<HTMLElement>('.popover-yui-kit__wrapper')
          ?.click();
        void selectFiles(label === 'Фото или видео');
      };
      element.addEventListener('click', handleClick, true);
      onCleanup(() => {
        disposed = true;
        element.removeEventListener('click', handleClick, true);
      });
    },
    { flush: 'post' }
  );
}
