import { Capacitor } from '@capacitor/core';
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { BackButtonPriority, useBackButtonHandler } from './useBackButton';
import { isIosStandalonePwa, isIosWeb } from '../utils/ios-pwa-viewport';

// Фокус, нужный редактору для вставки эмодзи, не должен открывать клавиатуру.
export function useComposerKeyboard(host: Ref<HTMLElement | null>) {
  const keyboardVisible = ref(false);
  const pickerOpen = ref(false);
  let mode: 'closed' | 'editor' | 'search' = 'closed';
  let editor: HTMLElement | null = null;
  let originalInputMode: string | null = null;
  let observer: MutationObserver | undefined;
  let pickerResizeObserver: ResizeObserver | undefined;
  let pickerLayoutFrame = 0;
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
  const scheduleIosPickerLayout = () => {
    if (!isIosStandalonePwa() || pickerLayoutFrame) return;
    pickerLayoutFrame = requestAnimationFrame(() => {
      pickerLayoutFrame = 0;
      const element = host.value;
      const openPicker = picker();
      if (!element || !openPicker) return;
      const viewport = window.visualViewport;
      const visibleTop = Math.max(0, viewport?.offsetTop || 0);
      const visibleBottom =
        visibleTop + (viewport?.height || window.innerHeight);
      const anchorTop =
        Math.min(element.getBoundingClientRect().top, visibleBottom) - 5;
      element.style.setProperty(
        '--ios-emoji-picker-max-height',
        `${Math.max(0, anchorTop - visibleTop - 8)}px`
      );
      element.style.setProperty(
        '--ios-emoji-picker-top',
        `${Math.max(visibleTop + 8, anchorTop - openPicker.getBoundingClientRect().height)}px`
      );
    });
  };
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
    // На iOS editor с inputmode=none при первом тапе может остаться без
    // клавиатуры. Подавляем её только пока открывается/открыт пикер.
    if (isMobile() && mode !== 'editor' && (!isIosWeb() || !!picker()))
      editor?.setAttribute('inputmode', 'none');
    else restoreInputMode();
    pickerOpen.value = !!picker();
    if (pickerOpen.value) scheduleIosPickerLayout();
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
    if (
      isIosWeb() &&
      event.pointerType === 'touch' &&
      target.closest('.emoji-picker .v3-emojis button')
    ) {
      // Вложенная кнопка редактора отменяет pointerdown и теряет touch-клик в WebKit.
      event.stopPropagation();
      return true;
    }
    if (target.closest('.smile-button') && !target.closest('.emoji-picker')) {
      if (!picker()) closeKeyboard();
      // WebKit после preventDefault на touch pointerdown теряет клик по кнопке.
      if (!isIosWeb() || event.pointerType !== 'touch') event.preventDefault();
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
    if (isIosWeb() && event.pointerType === 'touch') return;
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
    scheduleIosPickerLayout();
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
      window.visualViewport?.addEventListener(
        'scroll',
        scheduleIosPickerLayout
      );
      if (isIosStandalonePwa()) {
        pickerResizeObserver = new ResizeObserver(scheduleIosPickerLayout);
        pickerResizeObserver.observe(element);
        const chat = element.closest('.chat');
        if (chat) pickerResizeObserver.observe(chat);
      }
      sync();
      measureKeyboard();
      onCleanup(() => {
        observer?.disconnect();
        element.removeEventListener('focusin', handleFocus);
        document.removeEventListener('pointerdown', preserveFocus, true);
        document.removeEventListener('click', preserveSearchPicker);
        window.visualViewport?.removeEventListener('resize', measureKeyboard);
        window.visualViewport?.removeEventListener(
          'scroll',
          scheduleIosPickerLayout
        );
        pickerResizeObserver?.disconnect();
        cancelAnimationFrame(pickerLayoutFrame);
        pickerLayoutFrame = 0;
        element.style.removeProperty('--ios-emoji-picker-max-height');
        element.style.removeProperty('--ios-emoji-picker-top');
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
  const focusEditor = (): boolean => {
    if (!isMobile() && !isIosWeb()) return false;
    mode = 'editor';
    picker()?.closest<HTMLButtonElement>('.smile-button')?.click();
    sync();
    // Нативный focus должен остаться в пользовательском жесте: iOS не
    // открывает клавиатуру из отложенного TipTap commands.focus().
    editor?.focus({ preventScroll: true });
    return !!editor;
  };
  return { handlePointerDown, handleClick, focusEditor };
}
