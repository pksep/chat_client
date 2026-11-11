import { onBeforeUnmount, watch, type Ref } from 'vue';

// Снимок содержит только видимые группы: дальний переход не прокручивает всю историю.
export function useMessageNavigationTransition(
  containerRef: Ref<HTMLElement | null>,
  overlayRef: Ref<HTMLElement | null>,
  topicId: () => string
) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let cancelActive: (() => void) | undefined;
  let idle: Promise<void> = Promise.resolve();

  const cancel = (): void => cancelActive?.();

  const start = (direction: number, onInterrupt: () => void) => {
    cancel();
    const container = containerRef.value;
    const overlay = overlayRef.value;
    const content = container?.querySelector<HTMLElement>(
      '.chat__message-bubble'
    );
    if (!container || !overlay || !content) return null;

    const bounds = container.getBoundingClientRect();
    const rows = [...content.children]
      .filter(
        (element): element is HTMLElement => element instanceof HTMLElement
      )
      .map(element => ({ element, bounds: element.getBoundingClientRect() }))
      .filter(
        row => row.bounds.bottom > bounds.top && row.bounds.top < bounds.bottom
      );
    if (!rows.length) return null;

    const snapshot = document.createElement('div');
    snapshot.className =
      'chat__message-bubble chat__message-navigation-snapshot';
    for (const row of rows) {
      const clone = row.element.cloneNode(true) as HTMLElement;
      const originalAvatars = row.element.querySelectorAll<HTMLElement>(
        '.message-group__avatar-slot'
      );
      clone
        .querySelectorAll<HTMLElement>('.message-group__avatar-slot')
        .forEach((avatar, index) => {
          const avatarBounds = originalAvatars[index].getBoundingClientRect();
          const placeholder = document.createElement('div');
          placeholder.className = 'message-group__avatar-slot';
          avatar.before(placeholder);
          Object.assign(avatar.style, {
            position: 'absolute',
            top: `${avatarBounds.top - row.bounds.top}px`,
            left: `${avatarBounds.left - row.bounds.left}px`,
            bottom: 'auto'
          });
          avatar.style.setProperty('position', 'absolute', 'important');
        });
      for (const element of [clone, ...clone.querySelectorAll('*')]) {
        element.removeAttribute('id');
        element.removeAttribute('data-message-id');
        element.removeAttribute('data-testid');
        element.removeAttribute('autofocus');
      }
      Object.assign(clone.style, {
        position: 'absolute',
        margin: '0',
        top: `${row.bounds.top - bounds.top}px`,
        left: `${row.bounds.left - bounds.left}px`,
        width: `${row.bounds.width}px`
      });
      snapshot.append(clone);
    }
    overlay.replaceChildren(snapshot);
    overlay.style.display = 'block';
    container.classList.add('chat__message-wrapper--navigating');
    const animations = new Set<Animation>();
    const track = (animation: Animation): Animation => {
      animations.add(animation);
      return animation;
    };
    const departure = reducedMotion.matches
      ? null
      : track(
          snapshot.animate(
            [
              { transform: 'translateY(0)' },
              { transform: `translateY(${direction * 12}px)` }
            ],
            { duration: 100, easing: 'ease-out', fill: 'forwards' }
          )
        );
    let resolveIdle!: () => void;
    idle = new Promise<void>(resolve => {
      resolveIdle = resolve;
    });
    let active = true;
    const cleanup = (): void => {
      if (!active) return;
      active = false;
      animations.forEach(animation => animation.cancel());
      container.classList.remove('chat__message-wrapper--navigating');
      overlay.style.display = '';
      overlay.replaceChildren();
      container.removeEventListener('wheel', interrupt);
      container.removeEventListener('touchstart', interrupt);
      container.removeEventListener('pointerdown', interrupt);
      container.removeEventListener('keydown', interruptKey);
      window.removeEventListener('resize', interrupt);
      document.removeEventListener('visibilitychange', interrupt);
      reducedMotion.removeEventListener('change', interrupt);
      cancelActive = undefined;
      resolveIdle();
    };
    const interrupt = (): void => {
      onInterrupt();
      cleanup();
    };
    const interruptKey = (event: KeyboardEvent): void => {
      if (
        [
          'ArrowUp',
          'ArrowDown',
          'PageUp',
          'PageDown',
          'Home',
          'End',
          ' '
        ].includes(event.key)
      )
        interrupt();
    };
    cancelActive = cleanup;
    container.addEventListener('wheel', interrupt, { passive: true });
    container.addEventListener('touchstart', interrupt, { passive: true });
    container.addEventListener('pointerdown', interrupt, { passive: true });
    container.addEventListener('keydown', interruptKey);
    window.addEventListener('resize', interrupt);
    document.addEventListener('visibilitychange', interrupt);
    reducedMotion.addEventListener('change', interrupt);

    return {
      cancel: cleanup,
      async finish(finishOptions?: { duration?: number }): Promise<void> {
        if (!active) return;
        if (reducedMotion.matches) {
          cleanup();
          return;
        }
        const departureTransform = getComputedStyle(snapshot).transform;
        departure?.cancel();
        container.classList.remove('chat__message-wrapper--navigating');
        const options: KeyframeAnimationOptions = {
          duration: finishOptions?.duration ?? 180,
          easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
          fill: 'both'
        };
        const exit = track(
          snapshot.animate(
            [
              { opacity: 1, transform: departureTransform },
              { opacity: 0, transform: `translateY(${direction * 36}px)` }
            ],
            options
          )
        );
        const enter = track(
          content.animate(
            [
              { opacity: 0, transform: `translateY(${-direction * 28}px)` },
              { opacity: 1, transform: 'translateY(0)' }
            ],
            options
          )
        );
        await Promise.allSettled([exit.finished, enter.finished]);
        cleanup();
      }
    };
  };

  watch(topicId, cancel, { flush: 'sync' });
  onBeforeUnmount(cancel);
  return { start, cancel, waitForIdle: () => idle };
}
