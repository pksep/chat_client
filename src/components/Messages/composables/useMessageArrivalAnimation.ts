import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';
import type { IMessage } from '../../interfaces/interfaces';
import { latestMessageArrival } from '../../../services/useMessages';
import { isSameMessage } from '../../../utils/message-identity';

const DURATION_MS = 260;
const MAX_ARRIVALS = 8;
const layoutSelector = '.message[data-message-id], .top-element';
const layoutKey = (element: HTMLElement): string =>
  element.dataset.messageId ||
  `date:${element.querySelector<HTMLElement>('[data-date-divider-label]')?.dataset.dateDividerLabel}`;

export function useMessageArrivalAnimation(
  root: Ref<HTMLElement | null>,
  messages: () => IMessage[],
  topicId: () => string,
  suspended: () => boolean = () => false
): void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set<Animation>();
  const pending: IMessage[] = [];
  let positions: Map<string, number> | null = null;
  let frameId = 0;
  let revision = 0;
  let viewport: HTMLElement | null = null;

  const cleanup = (): void => {
    revision += 1;
    cancelAnimationFrame(frameId);
    frameId = 0;
    positions = null;
    pending.length = 0;
    animations.forEach(animation => animation.cancel());
    animations.clear();
    viewport?.removeEventListener('wheel', cleanup);
    viewport?.removeEventListener('touchstart', cleanup);
    viewport?.removeEventListener('pointerdown', cleanup);
    viewport = null;
    window.removeEventListener('resize', cleanup);
    document.removeEventListener('visibilitychange', cleanup);
    reducedMotion.removeEventListener('change', cleanup);
  };

  const track = (animation: Animation): void => {
    animations.add(animation);
    void animation.finished
      .catch(() => {})
      .finally(() => {
        animations.delete(animation);
        if (!animations.size && !positions) cleanup();
      });
  };

  const animate = (): void => {
    frameId = 0;
    const previousPositions = positions;
    const arrivals = pending.splice(0);
    positions = null;
    const container = viewport;
    if (!root.value || !container || !previousPositions) return;
    const bounds = container.getBoundingClientRect();
    const incomingIds = new Set(
      messages()
        .filter(message =>
          arrivals.some(arrival => isSameMessage(arrival, message))
        )
        .map(message => message.id)
    );
    animations.forEach(animation => animation.cancel());
    animations.clear();
    const layouts = [
      ...root.value.querySelectorAll<HTMLElement>(layoutSelector)
    ].map(element => ({ element, bounds: element.getBoundingClientRect() }));
    const deleting = root.value.dataset.messageDeletionActive === 'true';
    // Сначала читаем геометрию, затем запускаем анимации без изменения высоты ленты.
    for (const { element, bounds: current } of layouts) {
      if (current.bottom <= bounds.top || current.top >= bounds.bottom)
        continue;
      if (
        element.dataset.messageId &&
        incomingIds.has(element.dataset.messageId)
      ) {
        track(
          element.animate(
            [
              { opacity: 0, translate: '0 12px' },
              { opacity: 1, translate: '0 0' }
            ],
            { duration: DURATION_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
          )
        );
        continue;
      }
      const previousTop = previousPositions.get(layoutKey(element));
      if (deleting || previousTop === undefined) continue;
      const offset = previousTop - current.top;
      if (Math.abs(offset) < 1) continue;
      track(
        element.animate(
          [{ translate: `0 ${offset}px` }, { translate: '0 0' }],
          { duration: DURATION_MS, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' }
        )
      );
    }
    if (!animations.size) cleanup();
  };

  watch(
    latestMessageArrival,
    message => {
      if (
        suspended() ||
        !message ||
        !root.value ||
        message.topicId !== topicId() ||
        document.hidden ||
        reducedMotion.matches
      )
        return;
      pending.push(message);
      if (pending.length > MAX_ARRIVALS) pending.shift();
      if (positions) return;
      viewport = root.value.closest<HTMLElement>('.chat__message-wrapper');
      if (!viewport) return;
      positions = new Map(
        [...root.value.querySelectorAll<HTMLElement>(layoutSelector)].map(
          element => [layoutKey(element), element.getBoundingClientRect().top]
        )
      );
      viewport.addEventListener('wheel', cleanup, { passive: true });
      viewport.addEventListener('touchstart', cleanup, { passive: true });
      viewport.addEventListener('pointerdown', cleanup, { passive: true });
      window.addEventListener('resize', cleanup);
      document.addEventListener('visibilitychange', cleanup);
      reducedMotion.addEventListener('change', cleanup);
      const currentRevision = revision;
      // Скролл родителя фиксируется раньше в том же кадре, до первой отрисовки.
      void nextTick(async () => {
        await nextTick();
        if (revision === currentRevision)
          frameId = requestAnimationFrame(animate);
      });
    },
    { flush: 'sync' }
  );

  watch(topicId, cleanup, { flush: 'sync' });
  watch(suspended, cleanup, { flush: 'sync' });
  onBeforeUnmount(cleanup);
}
