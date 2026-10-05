import type { ObjectDirective } from 'vue';

const cleanups = new WeakMap<HTMLElement, () => void>();

export const vMenuListPress: ObjectDirective<HTMLElement> = {
  mounted(element) {
    const document = element.ownerDocument;
    let pressedRow: HTMLElement | null = null;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;

    const clear = () => {
      pressedRow?.removeAttribute('data-menu-list-pressed');
      pressedRow = null;
      pointerId = null;
    };
    const start = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' || !event.isPrimary) return;
      clear();
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('.menu-list-row')
          : null;
      if (!row || !element.contains(row)) return;
      pressedRow = row;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      row.setAttribute('data-menu-list-pressed', '');
    };
    const move = (event: PointerEvent) => {
      if (
        event.pointerId === pointerId &&
        Math.hypot(event.clientX - startX, event.clientY - startY) >= 10
      ) {
        clear();
      }
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId === pointerId) clear();
    };

    element.addEventListener('pointerdown', start, { passive: true });
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerup', end, { passive: true });
    document.addEventListener('pointercancel', end, { passive: true });
    document.addEventListener('scroll', clear, true);
    document.defaultView?.addEventListener('blur', clear);
    cleanups.set(element, () => {
      clear();
      element.removeEventListener('pointerdown', start);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      document.removeEventListener('scroll', clear, true);
      document.defaultView?.removeEventListener('blur', clear);
    });
  },
  beforeUnmount(element) {
    cleanups.get(element)?.();
    cleanups.delete(element);
  }
};
