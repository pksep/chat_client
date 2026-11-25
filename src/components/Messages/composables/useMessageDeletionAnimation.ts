import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';
import type { IMessage } from '../../interfaces/interfaces';
import { isDeletedMessageForTopic } from '../../../services/useMessages';

const DISSOLVE_DURATION_MS = 680;
const MAX_GHOSTS = 24;
const MAX_DUST_GHOSTS = 4;
const MAX_FILTER_AREA = 220_000;
let nextFilterId = 0;
const layoutSelector = '.message[data-message-id], .top-element';
const getLayoutKey = (element: HTMLElement): string =>
  element.dataset.messageId
    ? `message:${element.dataset.messageId}`
    : `date:${element.querySelector<HTMLElement>('[data-date-divider-label]')?.dataset.dateDividerLabel}`;
const getClip = (container: HTMLElement) => {
  const bounds = container.getBoundingClientRect();
  const viewport = container
    .closest('.chat__message-viewport')
    ?.getBoundingClientRect();
  if (!viewport?.height) return bounds;
  const left = Math.max(bounds.left, viewport.left);
  const top = Math.max(bounds.top, viewport.top);
  return new DOMRect(
    left,
    top,
    Math.max(0, Math.min(bounds.right, viewport.right) - left),
    Math.max(0, Math.min(bounds.bottom, viewport.bottom) - top)
  );
};

const freezeSnapshotMedia = (
  content: HTMLElement,
  snapshot: HTMLElement
): void => {
  const sources = content.querySelectorAll<
    HTMLCanvasElement | HTMLVideoElement
  >('canvas, video');
  snapshot
    .querySelectorAll<HTMLCanvasElement | HTMLVideoElement>('canvas, video')
    .forEach((copy, index) => {
      const source = sources[index];
      if (source instanceof HTMLVideoElement && source.readyState < 2) return;
      const bounds = source.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const frame = document.createElement('canvas');
      const scale = Math.min(
        devicePixelRatio,
        2,
        1024 / Math.max(bounds.width, bounds.height)
      );
      frame.width = Math.max(1, Math.round(bounds.width * scale));
      frame.height = Math.max(1, Math.round(bounds.height * scale));
      frame.className = copy.className;
      frame.style.cssText = copy.style.cssText;
      Object.assign(frame.style, {
        width: `${bounds.width}px`,
        height: `${bounds.height}px`,
        objectFit: getComputedStyle(source).objectFit
      });
      try {
        const context = frame.getContext('2d');
        if (!context) return;
        context.drawImage(source, 0, 0, frame.width, frame.height);
        copy.replaceWith(frame);
      } catch {
        // Недоступный кадр не должен мешать удалению сообщения.
      }
    });
};

interface DeletionGhost {
  element: HTMLElement;
  filter: SVGSVGElement | null;
  mask: SVGFEColorMatrixElement | null;
  displacement: SVGFEDisplacementMapElement | null;
  startedAt: number;
  direction: number;
}

export function useMessageDeletionAnimation(
  root: Ref<HTMLElement | null>,
  messages: () => IMessage[],
  topicId: () => string,
  suspended: () => boolean = () => false
): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ghosts: DeletionGhost[] = [];
  const movements = new Set<Animation>();
  let layer: HTMLElement | null = null;
  let viewport: HTMLElement | null = null;
  let frameId = 0;
  let layoutFrameId = 0;
  let revision = 0;
  let pendingPositions: Map<string, number> | null = null;

  const cleanup = (): void => {
    revision += 1;
    cancelAnimationFrame(frameId);
    cancelAnimationFrame(layoutFrameId);
    frameId = 0;
    layoutFrameId = 0;
    pendingPositions = null;
    movements.forEach(animation => animation.cancel());
    movements.clear();
    ghosts.length = 0;
    if (root.value) delete root.value.dataset.messageDeletionActive;
    layer?.remove();
    layer = null;
    viewport?.removeEventListener('wheel', cleanup);
    viewport?.removeEventListener('touchstart', cleanup);
    viewport?.removeEventListener('pointerdown', cleanup);
    viewport = null;
    window.removeEventListener('resize', cleanup);
    document.removeEventListener('visibilitychange', cleanup);
    reducedMotion.removeEventListener('change', cleanup);
  };

  const animateFrame = (now: number): void => {
    frameId = 0;
    for (let index = ghosts.length - 1; index >= 0; index -= 1) {
      const ghost = ghosts[index];
      const progress = Math.min(
        1,
        (now - ghost.startedAt) / DISSOLVE_DURATION_MS
      );
      if (progress >= 1) {
        ghost.element.remove();
        ghost.filter?.remove();
        ghosts.splice(index, 1);
        continue;
      }

      ghost.element.style.opacity = String(1 - progress ** 1.5);
      ghost.element.style.transform = `translate(${ghost.direction * progress * 20}px, ${-progress * 14}px)`;
      ghost.mask?.setAttribute(
        'values',
        `1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 20 0 0 0 ${1 - (0.15 + progress * 0.75) * 20}`
      );
      ghost.displacement?.setAttribute('scale', String(progress ** 1.25 * 35));
    }
    if (ghosts.length) {
      frameId = requestAnimationFrame(animateFrame);
    } else {
      layer?.remove();
      layer = null;
      if (!movements.size && !pendingPositions && !layoutFrameId) cleanup();
    }
  };

  const ensureLayer = (container: HTMLElement): HTMLElement => {
    if (layer) return layer;
    viewport = container;
    const bounds = getClip(container);
    layer = document.createElement('div');
    layer.className = 'message-deletion-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    Object.assign(layer.style, {
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      borderRadius: getComputedStyle(container).borderRadius
    });
    // Слой ленты Android имеет will-change: translate. Вложенный fixed-слой
    // получает его координаты и обрезается скроллером вместо области экрана.
    (container.closest('.chat-container') || document.body).append(layer);
    root.value!.dataset.messageDeletionActive = 'true';
    container.addEventListener('wheel', cleanup, { passive: true });
    container.addEventListener('touchstart', cleanup, { passive: true });
    container.addEventListener('pointerdown', cleanup, { passive: true });
    window.addEventListener('resize', cleanup);
    document.addEventListener('visibilitychange', cleanup);
    reducedMotion.addEventListener('change', cleanup);
    return layer;
  };

  const createGhost = (
    message: HTMLElement,
    container: HTMLElement
  ): boolean => {
    if (ghosts.length >= MAX_GHOSTS) return false;
    const content = message.querySelector<HTMLElement>(
      '.message__content__articles'
    );
    if (!content) return false;
    const bounds = content.getBoundingClientRect();
    const clip = getClip(container);
    if (
      !bounds.width ||
      !bounds.height ||
      bounds.bottom <= clip.top ||
      bounds.top >= clip.bottom ||
      bounds.right <= clip.left ||
      bounds.left >= clip.right
    )
      return false;

    const overlay = ensureLayer(container);
    const ghost = document.createElement('div');
    ghost.className = message.className;
    ghost.classList.remove(
      'highlighted',
      'message--selected',
      'message--selection-active'
    );
    ghost.classList.add('message-deletion-ghost');
    ghost.dataset.isMeSender = message.dataset.isMeSender;
    const snapshot = content.cloneNode(true) as HTMLElement;
    freezeSnapshotMedia(content, snapshot);
    Object.assign(snapshot.style, {
      width: `${bounds.width}px`,
      maxWidth: 'none',
      margin: '0',
      transform: 'none'
    });
    snapshot
      .querySelectorAll<HTMLElement>('[data-message-id], [data-testid]')
      .forEach(element => {
        element.removeAttribute('data-message-id');
        element.removeAttribute('data-testid');
      });
    snapshot
      .querySelectorAll(
        'audio, iframe, object, embed, .message__reply-button, .message-quote-highlight__background'
      )
      .forEach(element => element.remove());
    snapshot.querySelectorAll('video').forEach(video => {
      video.removeAttribute('autoplay');
      video.removeAttribute('src');
      video.querySelectorAll('source').forEach(source => source.remove());
      video.preload = 'none';
      video.muted = true;
    });
    ghost.append(snapshot);
    Object.assign(ghost.style, {
      left: `${bounds.left - clip.left}px`,
      top: `${bounds.top - clip.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`
    });

    let filter: SVGSVGElement | null = null;
    // Большие медиа растворяются без шумового фильтра, чтобы не перегружать телефон.
    if (
      bounds.width * bounds.height <= MAX_FILTER_AREA &&
      ghosts.filter(item => item.filter).length < MAX_DUST_GHOSTS
    ) {
      const id = `message-deletion-dust-${++nextFilterId}`;
      filter = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      filter.setAttribute('width', '0');
      filter.setAttribute('height', '0');
      filter.innerHTML = `<defs><filter id="${id}" filterUnits="userSpaceOnUse" x="-24" y="-24" width="${bounds.width + 48}" height="${bounds.height + 48}" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="1" seed="${nextFilterId % 17}" result="noise"/><feColorMatrix in="noise" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 20 0 0 0 -2" result="mask"/><feComposite in="SourceGraphic" in2="mask" operator="in" result="dissolved"/><feDisplacementMap in="dissolved" in2="noise" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></defs>`;
      overlay.append(filter);
      ghost.style.filter = `url("#${id}")`;
    }
    overlay.append(ghost);
    ghosts.push({
      element: ghost,
      filter,
      mask: filter?.querySelector('feColorMatrix') || null,
      displacement: filter?.querySelector('feDisplacementMap') || null,
      startedAt: performance.now(),
      direction: message.dataset.isMeSender === 'true' ? 1 : -1
    });
    if (!frameId) frameId = requestAnimationFrame(animateFrame);
    return true;
  };

  const animateLayout = (): void => {
    layoutFrameId = 0;
    const positions = pendingPositions;
    pendingPositions = null;
    if (!positions || !root.value) return;
    movements.forEach(animation => animation.cancel());
    movements.clear();
    root.value
      .querySelectorAll<HTMLElement>(layoutSelector)
      .forEach(element => {
        const previousTop = positions.get(getLayoutKey(element));
        if (previousTop === undefined) return;
        const offset = previousTop - element.getBoundingClientRect().top;
        if (Math.abs(offset) < 1) return;
        const animation = element.animate(
          [
            { transform: `translateY(${offset}px)` },
            { transform: 'translateY(0)' }
          ],
          {
            duration: 600,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            fill: 'backwards'
          }
        );
        movements.add(animation);
        void animation.finished
          .catch(() => {})
          .finally(() => {
            movements.delete(animation);
            if (
              !movements.size &&
              !ghosts.length &&
              !pendingPositions &&
              !layoutFrameId
            )
              cleanup();
          });
      });
    if (!movements.size && !ghosts.length) cleanup();
  };

  watch(messages, (current, previous) => {
    if (
      suspended() ||
      !root.value ||
      !previous?.length ||
      document.hidden ||
      reducedMotion.matches ||
      previous[0].topicId !== topicId() ||
      (current[0] && current[0].topicId !== topicId())
    )
      return;
    const ids = new Set(current.map(message => message.id));
    const deleted = previous.filter(
      message =>
        !ids.has(message.id) &&
        isDeletedMessageForTopic(message.topicId, message)
    );
    if (!deleted.length) return;
    const container = root.value.closest<HTMLElement>('.chat__message-wrapper');
    if (!container) return;

    const elements = Array.from(
      root.value.querySelectorAll<HTMLElement>(layoutSelector)
    );
    const byId = new Map(
      elements.map(element => [element.dataset.messageId, element])
    );
    let hasVisibleDeletion = false;
    deleted.forEach(message => {
      const element = byId.get(message.id);
      if (element)
        hasVisibleDeletion =
          createGhost(element, container) || hasVisibleDeletion;
    });
    if (!hasVisibleDeletion || pendingPositions) return;
    pendingPositions = new Map(
      elements.map(element => [
        getLayoutKey(element),
        element.getBoundingClientRect().top
      ])
    );
    const currentRevision = revision;
    // Родитель сначала восстанавливает скролл; затем анимируем оставшееся смещение.
    void nextTick(async () => {
      await nextTick();
      if (revision === currentRevision)
        layoutFrameId = requestAnimationFrame(animateLayout);
    });
  });

  watch(topicId, cleanup, { flush: 'sync' });
  watch(suspended, cleanup, { flush: 'sync' });
  onBeforeUnmount(cleanup);
}
