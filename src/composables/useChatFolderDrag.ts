import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue';
import type { ChatFolder } from '../services/useChatSDK/chat-folder';
import { moveChatFolder } from '../utils/chat-folder-order';

const HOLD_DELAY = 350;
const MOVE_THRESHOLD = 8;

interface FolderDragOptions {
  folders: () => readonly ChatFolder[];
  disabled: () => boolean;
  horizontal?: () => boolean;
  onReorder: (folderIds: string[]) => void | Promise<void>;
}

export const useChatFolderDrag = (options: FolderDragOptions) => {
  const containerRef = ref<HTMLElement | null>(null);
  const draggedFolderId = ref<string | null>(null);
  const draftIds = shallowRef<string[] | null>(null);
  const orderedFolders = computed(() => {
    const folders = options.folders();
    if (!draftIds.value) return folders;
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    return draftIds.value.flatMap(id => {
      const folder = byId.get(id);
      return folder ? [folder] : [];
    });
  });
  let candidate: {
    id: string;
    element: HTMLElement;
    ids: string[];
    x: number;
    y: number;
    touchId?: number;
    pointerId?: number;
  } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let animationFrame = 0;
  let preview: HTMLElement | null = null;
  let offsetX = 0;
  let offsetY = 0;
  let previewLeft = 0;
  let previewTop = 0;
  let clientX = 0;
  let clientY = 0;
  let previousCoordinate = NaN;
  let previousScroll = NaN;
  let blockClickUntil = 0;

  const getLayoutMiddle = (
    element: HTMLElement,
    container: HTMLElement,
    horizontal: boolean,
    containerStart: number
  ) => {
    let offset = 0;
    let parent: HTMLElement | null = element;
    while (parent && parent !== container) {
      offset += horizontal ? parent.offsetLeft : parent.offsetTop;
      parent = parent.offsetParent as HTMLElement | null;
    }
    // FLIP меняет визуальный rect, но не позицию в раскладке: не даём папкам дрожать.
    if (parent === container)
      return (
        containerStart +
        (horizontal ? container.clientLeft : container.clientTop) +
        offset -
        (horizontal ? container.scrollLeft : container.scrollTop) +
        (horizontal ? element.offsetWidth : element.offsetHeight) / 2
      );
    const rect = element.getBoundingClientRect();
    return horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
  };

  const updateOrder = () => {
    if (!candidate || !draftIds.value || !containerRef.value) return;
    const horizontal = options.horizontal?.() ?? false;
    const container = containerRef.value;
    const currentIndex = draftIds.value.indexOf(candidate.id);
    const coordinate = horizontal ? clientX : clientY;
    const scroll = horizontal ? container.scrollLeft : container.scrollTop;
    if (coordinate === previousCoordinate && scroll === previousScroll) return;
    previousCoordinate = coordinate;
    previousScroll = scroll;
    const containerRect = container.getBoundingClientRect();
    let targetId = candidate.id;
    for (const element of container.querySelectorAll<HTMLElement>(
      '[data-folder-id]'
    )) {
      const id = element.dataset.folderId!;
      const index = draftIds.value.indexOf(id);
      const middle = getLayoutMiddle(
        element,
        container,
        horizontal,
        horizontal ? containerRect.left : containerRect.top
      );
      if (index < currentIndex && coordinate < middle) {
        targetId = id;
        break;
      }
      if (index > currentIndex && coordinate > middle) targetId = id;
    }
    if (targetId !== candidate.id)
      draftIds.value = moveChatFolder(draftIds.value, candidate.id, targetId);
  };

  const animate = () => {
    if (!preview || !containerRef.value) return;
    const horizontal = options.horizontal?.() ?? false;
    const x = horizontal ? clientX - offsetX : previewLeft;
    const y = horizontal ? previewTop : clientY - offsetY;
    preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const rect = containerRef.value.getBoundingClientRect();
    const coordinate = horizontal ? clientX : clientY;
    const start = horizontal ? rect.left : rect.top;
    const end = horizontal ? rect.right : rect.bottom;
    const crossCoordinate = horizontal ? candidate!.y : candidate!.x;
    const inside = horizontal
      ? crossCoordinate >= rect.top - 24 && crossCoordinate <= rect.bottom + 24
      : crossCoordinate >= rect.left - 24 && crossCoordinate <= rect.right + 24;
    const delta =
      coordinate < start + 32
        ? -Math.min(12, (start + 32 - coordinate) / 3)
        : coordinate > end - 32
          ? Math.min(12, (coordinate - end + 32) / 3)
          : 0;
    if (delta && inside) {
      if (horizontal) containerRef.value.scrollLeft += delta;
      else containerRef.value.scrollTop += delta;
    }
    updateOrder();
    animationFrame = requestAnimationFrame(animate);
  };

  const activate = () => {
    if (!candidate || options.disabled()) return;
    const element = candidate.element;
    const rect = element.getBoundingClientRect();
    offsetX = candidate.x - rect.left;
    offsetY = candidate.y - rect.top;
    previewLeft = rect.left;
    previewTop = rect.top;
    draftIds.value = [...candidate.ids];
    preview = element.cloneNode(true) as HTMLElement;
    // Копия сохраняет размеры и цвета исходного элемента в обеих темах.
    const originals = [element, ...element.querySelectorAll('*')];
    const copies = [preview, ...preview.querySelectorAll('*')];
    originals.forEach((original, index) => {
      const style = getComputedStyle(original);
      copies[index].setAttribute(
        'style',
        Array.from(style)
          .map(property => `${property}:${style.getPropertyValue(property)};`)
          .join('')
      );
      for (const attribute of ['id', 'data-testid', 'data-folder-id'])
        copies[index].removeAttribute(attribute);
    });
    preview.classList.add('chat-folder-drag-preview');
    preview.setAttribute('aria-hidden', 'true');
    Object.assign(preview.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      margin: '0',
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      minHeight: '0',
      zIndex: '10000',
      pointerEvents: 'none',
      transition: 'none',
      animation: 'none',
      backgroundColor: getComputedStyle(element).getPropertyValue(
        '--surface-input-primary'
      )
    });
    document.body.appendChild(preview);
    draggedFolderId.value = candidate.id;
    animate();
  };

  const cleanup = () => {
    clearTimeout(holdTimer);
    cancelAnimationFrame(animationFrame);
    preview?.remove();
    preview = null;
    candidate = null;
    previousCoordinate = NaN;
    previousScroll = NaN;
    draftIds.value = null;
    draggedFolderId.value = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', cancel);
    window.removeEventListener('blur', cancel);
    window.removeEventListener('keydown', onWindowKeydown);
  };

  const cancel = () => {
    if (draggedFolderId.value) blockClickUntil = Date.now() + 400;
    cleanup();
  };

  const finish = () => {
    const ids = draftIds.value;
    const changed =
      ids && candidate && ids.some((id, index) => candidate!.ids[index] !== id);
    if (draggedFolderId.value) blockClickUntil = Date.now() + 400;
    cleanup();
    if (changed) void options.onReorder(ids!);
  };

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') cancel();
  }

  function onPointerMove(event: PointerEvent) {
    if (!candidate || event.pointerId !== candidate.pointerId) return;
    clientX = event.clientX;
    clientY = event.clientY;
    if (
      !draggedFolderId.value &&
      Math.abs(
        options.horizontal?.() ? clientX - candidate.x : clientY - candidate.y
      ) >= MOVE_THRESHOLD
    )
      activate();
    if (draggedFolderId.value) {
      event.preventDefault();
      updateOrder();
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId === candidate?.pointerId) finish();
  }

  function onTouchMove(event: TouchEvent) {
    if (!candidate) return;
    if (event.touches.length !== 1) {
      cancel();
      return;
    }
    const touch = Array.from(event.touches).find(
      item => item.identifier === candidate!.touchId
    );
    if (!touch) return;
    clientX = touch.clientX;
    clientY = touch.clientY;
    if (draggedFolderId.value) {
      event.preventDefault();
      updateOrder();
    } else if (
      Math.hypot(clientX - candidate.x, clientY - candidate.y) >= MOVE_THRESHOLD
    )
      cancel();
  }

  function onTouchEnd(event: TouchEvent) {
    if (
      Array.from(event.changedTouches).some(
        touch => touch.identifier === candidate?.touchId
      )
    )
      finish();
  }

  const begin = (event: Event, x: number, y: number) => {
    if (candidate || options.disabled() || options.folders().length < 2)
      return false;
    const element = (event.target as Element).closest<HTMLElement>(
      '[data-folder-id]'
    );
    if (!element || !containerRef.value?.contains(element)) return false;
    candidate = {
      id: element.dataset.folderId!,
      element,
      ids: options.folders().map(folder => folder.id),
      x,
      y
    };
    clientX = x;
    clientY = y;
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', onWindowKeydown);
    return true;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    if (!begin(event, event.clientX, event.clientY)) return;
    candidate!.pointerId = event.pointerId;
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', cancel);
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      cancel();
      return;
    }
    const touch = event.touches[0];
    if (!begin(event, touch.clientX, touch.clientY)) return;
    candidate!.touchId = touch.identifier;
    // До удержания не блокируем нативную прокрутку и обычные нажатия.
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', cancel);
    holdTimer = setTimeout(activate, HOLD_DELAY);
  };

  const onClickCapture = (event: Event) => {
    if (draggedFolderId.value || Date.now() < blockClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (!event.altKey || options.disabled()) return;
    const horizontal = options.horizontal?.() ?? false;
    const direction =
      event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp')
        ? -1
        : event.key === (horizontal ? 'ArrowRight' : 'ArrowDown')
          ? 1
          : 0;
    if (!direction) return;
    const element = (event.target as Element).closest<HTMLElement>(
      '[data-folder-id]'
    );
    const ids = options.folders().map(folder => folder.id);
    const index = ids.indexOf(element?.dataset.folderId || '');
    const targetId = ids[index + direction];
    if (index < 0 || !targetId) return;
    event.preventDefault();
    void options.onReorder(moveChatFolder(ids, ids[index], targetId));
  };

  watch(
    () =>
      options
        .folders()
        .map(folder => folder.id)
        .join(','),
    cancel
  );
  onScopeDispose(cleanup);

  return {
    containerRef,
    orderedFolders,
    draggedFolderId,
    onPointerDown,
    onTouchStart,
    onClickCapture,
    onKeydown
  };
};
