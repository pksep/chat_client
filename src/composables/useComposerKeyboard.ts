import { Capacitor } from '@capacitor/core';
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { BackButtonPriority, useBackButtonHandler } from './useBackButton';
import { isIosStandalonePwa } from '../utils/ios-pwa-viewport';

// Фокус, нужный редактору для вставки эмодзи, не должен открывать клавиатуру.
export function useComposerKeyboard(host: Ref<HTMLElement | null>) {
  const keyboardVisible = ref(false);
  const pickerOpen = ref(false);
  let mode: 'closed' | 'editor' | 'search' = 'closed';
  let editor: HTMLElement | null = null;
  let originalInputMode: string | null = null;
  let observer: MutationObserver | undefined;
  let viewportHeight = 0;
  let viewportWidth = 0;
  const isMobile = () =>
    Capacitor.isNativePlatform() ||
    window.matchMedia('(max-width: 480px)').matches;
  const picker = () =>
    [
      ...(host.value?.querySelectorAll<HTMLElement>('.emoji-picker--open') ||
        [])
    ].find(element => element.getClientRects().length > 0);
  const search = () =>
    picker()?.querySelector<HTMLInputElement>('.v3-search input');
  const restoreInputMode = () => {
    if (!editor) return;
    if (originalInputMode === null) editor.removeAttribute('inputmode');
    else editor.setAttribute('inputmode', originalInputMode);
  };
  const sync = () => {
    const next = host.value?.querySelector<HTMLElement>('.ProseMirror') || null;
    if (next !== editor) {
      restoreInputMode();
      editor = next;
      originalInputMode = next?.getAttribute('inputmode') ?? null;
    }
    if (isMobile() && mode !== 'editor')
      editor?.setAttribute('inputmode', 'none');
    else restoreInputMode();
    pickerOpen.value = !!picker();
  };
  const closeKeyboard = () => {
    mode = 'closed';
    sync();
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && host.value?.contains(focused))
      focused.blur();
    keyboardVisible.value = false;
  };
  const handlePointerDown = (event: PointerEvent): boolean => {
    if (!isMobile() || !(event.target instanceof Element)) return false;
    const target = event.target;
    if (target.closest('.smile-button') && !target.closest('.emoji-picker')) {
      if (!picker()) closeKeyboard();
      // WebKit после preventDefault на touch pointerdown теряет клик по кнопке.
      if (!isIosStandalonePwa()) event.preventDefault();
      event.stopPropagation();
      return true;
    }
    if (
      target instanceof HTMLInputElement &&
      target.closest('.emoji-picker .v3-search')
    ) {
      mode = 'search';
      sync();
      event.stopPropagation();
      target.focus({ preventScroll: true });
      return true;
    }
    if (target.closest('.ProseMirror')) {
      mode = 'editor';
      sync();
      picker()?.closest<HTMLButtonElement>('.smile-button')?.click();
    }
    return false;
  };
  const handleClick = (event: MouseEvent) => {
    if (!isMobile() || !(event.target instanceof Element)) return;
    if (
      event.target.closest('.smile-button') &&
      !event.target.closest('.emoji-picker') &&
      !picker()
    )
      closeKeyboard();
  };
  const preserveFocus = (event: PointerEvent) => {
    if (!isMobile() || mode === 'closed' || !(event.target instanceof Element))
      return;
    const focused = mode === 'search' ? search() : editor;
    if (document.activeElement !== focused || !focused) return;
    if (
      event.target.closest('.smile-button') &&
      !event.target.closest('.emoji-picker')
    )
      return;
    if (
      !event.target.closest('input, textarea, select, [contenteditable="true"]')
    )
      event.preventDefault();
  };
  const handleFocus = (event: FocusEvent) => {
    if (!isMobile() || event.target !== editor || mode !== 'search') return;
    search()?.focus({ preventScroll: true });
  };
  const preserveSearchPicker = (event: MouseEvent) => {
    if (
      !isMobile() ||
      mode !== 'search' ||
      !(event.target instanceof Element) ||
      document.activeElement !== search() ||
      host.value?.contains(event.target) ||
      event.target.closest(
        'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'
      )
    )
      return;
    // Нейтральный клик не должен удалять поле поиска и закрывать клавиатуру.
    event.stopPropagation();
  };
  const measureKeyboard = () => {
    const viewport = window.visualViewport;
    if (!viewport || !isMobile()) return;
    if (viewportWidth !== viewport.width) {
      viewportWidth = viewport.width;
      viewportHeight = viewport.height;
    }
    viewportHeight = Math.max(viewportHeight, viewport.height);
    const visible = viewportHeight - viewport.height > 100;
    if (keyboardVisible.value && !visible) {
      mode = 'closed';
      sync();
    }
    keyboardVisible.value = visible;
  };
  useBackButtonHandler(
    keyboardVisible,
    closeKeyboard,
    BackButtonPriority.keyboard
  );
  useBackButtonHandler(
    pickerOpen,
    () => {
      picker()?.closest<HTMLButtonElement>('.smile-button')?.click();
      closeKeyboard();
    },
    BackButtonPriority.overlay
  );
  watch(
    host,
    (element, _previous, onCleanup) => {
      if (!element) return;
      observer = new MutationObserver(sync);
      observer.observe(element, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      });
      element.addEventListener('focusin', handleFocus);
      document.addEventListener('pointerdown', preserveFocus, true);
      document.addEventListener('click', preserveSearchPicker);
      window.visualViewport?.addEventListener('resize', measureKeyboard);
      sync();
      measureKeyboard();
      onCleanup(() => {
        observer?.disconnect();
        element.removeEventListener('focusin', handleFocus);
        document.removeEventListener('pointerdown', preserveFocus, true);
        document.removeEventListener('click', preserveSearchPicker);
        window.visualViewport?.removeEventListener('resize', measureKeyboard);
        restoreInputMode();
        editor = null;
        mode = 'closed';
        keyboardVisible.value = false;
        pickerOpen.value = false;
      });
    },
    { flush: 'post' }
  );
  onBeforeUnmount(() => observer?.disconnect());
  return { handlePointerDown, handleClick };
}
