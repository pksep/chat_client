import { getCurrentScope, onScopeDispose, ref } from 'vue';

export const useContextMenu = () => {
  const isOpen = ref<Record<string, boolean>>({});
  const position = ref({ x: 0, y: 0 });
  const contextMediaId = ref<string | null>(null);
  let clearOpeningClickGuard = () => {};
  let cancelLongPress = () => {};

  const guardOpeningClick = () => {
    clearOpeningClickGuard();
    const suppress = (event: MouseEvent) => {
      if (event.detail === 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'click') clearOpeningClickGuard();
    };
    const clear = () => {
      window.removeEventListener('mousedown', suppress, true);
      window.removeEventListener('click', suppress, true);
      window.removeEventListener('pointerdown', clear, true);
    };
    clearOpeningClickGuard = clear;
    // До следующего pointerdown это отпускание открывающего зажатия.
    // Его target может смениться при перегруппировке прочитанных сообщений.
    window.addEventListener('mousedown', suppress, true);
    window.addEventListener('click', suppress, true);
    window.addEventListener('pointerdown', clear, true);
  };

  const openActivePopover = (
    id: string,
    event: MouseEvent,
    longPress = false
  ): void => {
    if (event.altKey) return;
    cancelLongPress();
    if (longPress) guardOpeningClick();
    else if (!isOpen.value[id]) clearOpeningClickGuard();
    event.preventDefault();
    contextMediaId.value =
      event.target instanceof Element
        ? event.target
            .closest('[data-message-media-id]')
            ?.getAttribute('data-message-media-id') || null
        : null;
    position.value = { x: event.clientX, y: event.clientY };
    Object.keys(isOpen.value).forEach(key => {
      if (key !== id) {
        isOpen.value[key] = false;
      }
    });
    isOpen.value[id] = true;
  };

  const startTouchLongPress = (
    id: string,
    event: PointerEvent,
    options?: { isTargetPresent?: () => boolean; cancelOnScroll?: boolean }
  ) => {
    cancelLongPress();
    const isTargetPresent =
      options?.isTargetPresent ||
      (() =>
        !!document.querySelector(
          `.message[data-message-id="${CSS.escape(id)}"]`
        ));
    const finish = () => cancelLongPress();
    const move = (next: PointerEvent) => {
      if (
        next.pointerId !== event.pointerId ||
        Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) >
          10
      )
        finish();
    };
    const nextPointer = (next: PointerEvent) => {
      if (next.pointerId !== event.pointerId) finish();
    };
    const timer = setTimeout(() => {
      finish();
      // Чтение может перегруппировать сообщение, пока палец остаётся на экране.
      if (isTargetPresent()) openActivePopover(id, event, true);
    }, 450);
    cancelLongPress = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      window.removeEventListener('pointerdown', nextPointer, true);
      window.removeEventListener('scroll', finish, true);
      window.removeEventListener('blur', finish);
      document.removeEventListener('visibilitychange', finish);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
    window.addEventListener('pointerdown', nextPointer, true);
    if (options?.cancelOnScroll)
      window.addEventListener('scroll', finish, true);
    window.addEventListener('blur', finish);
    document.addEventListener('visibilitychange', finish);
  };

  const closeActivePopover = (id?: string): void => {
    cancelLongPress();
    clearOpeningClickGuard();
    if (id) {
      isOpen.value[id] = false;
    } else {
      Object.keys(isOpen.value).forEach(key => {
        isOpen.value[key] = false;
      });
    }
    position.value = {
      x: 0,
      y: 0
    };
  };

  if (getCurrentScope()) onScopeDispose(() => closeActivePopover());

  return {
    isOpen,
    position,
    contextMediaId,
    startTouchLongPress,
    openActivePopover,
    closeActivePopover
  };
};

const {
  isOpen,
  position,
  contextMediaId,
  startTouchLongPress,
  openActivePopover,
  closeActivePopover
} = useContextMenu();

export {
  isOpen,
  position,
  contextMediaId,
  startTouchLongPress,
  openActivePopover,
  closeActivePopover
};
