import { Capacitor, registerPlugin } from '@capacitor/core';

type Phase = 'prepare' | 'progress' | 'end';
type KeyboardFrame = (bottom: number, phase: Phase) => void;
type KeyboardAnimation = (
  from: number,
  to: number,
  duration: number,
  startedAt: number,
  fractions?: number[]
) => void;
declare global {
  interface Window {
    __sepAndroidKeyboard?: KeyboardFrame;
    __sepAndroidKeyboardAnimate?: KeyboardAnimation;
    __sepAndroidDismissComposerOverlay?: () => void;
  }
}

const nativeViewport = registerPlugin<{
  start(): Promise<void>;
  stop(): Promise<void>;
  setOverlayOpen(options: { open: boolean }): Promise<void>;
}>('KeyboardViewport');
export const setAndroidComposerOverlayOpen = (open: boolean) => {
  if (
    Capacitor.getPlatform() === 'android' &&
    Capacitor.isPluginAvailable('KeyboardViewport')
  )
    void nativeViewport.setOverlayOpen({ open }).catch(() => {});
};
let keyboardInset = 0;
let motion:
  | {
      from: number;
      to: number;
      duration: number;
      startedAt: number;
      fractions?: number[];
    }
  | undefined;
const interpolate = (fraction: number, samples?: number[]) => {
  if (!samples || samples.length < 2) return fraction;
  const position = fraction * (samples.length - 1);
  const index = Math.min(samples.length - 2, Math.floor(position));
  return (
    samples[index] + (samples[index + 1] - samples[index]) * (position - index)
  );
};
export const getAndroidKeyboardInset = () =>
  motion
    ? motion.from +
      (motion.to - motion.from) *
        interpolate(
          Math.min(
            1,
            Math.max(0, (Date.now() - motion.startedAt) / motion.duration)
          ),
          motion.fractions
        )
    : keyboardInset;
export const androidKeyboardEvent = 'sep:android-keyboard';
let activeViewport: KeyboardFrame | undefined;

export function createAndroidKeyboardViewport(): KeyboardFrame & {
  animate: KeyboardAnimation;
} {
  const root = document.documentElement;
  let base = 0;
  let routes: HTMLElement[] = [];
  let moving: HTMLElement[] = [];
  let scrollers: HTMLElement[] = [];
  const scrollCorrections = new Map<HTMLElement, number>();
  let correctionRange = 0;
  let animations: Animation[] = [];
  const cancelAnimations = () => {
    for (const animation of animations) animation.cancel();
    animations = [];
    motion = undefined;
  };
  const layerDelta = (element: HTMLElement, bottom: number) =>
    bottom -
    base -
    (scrollCorrections.get(element) || 0) *
      (correctionRange ? Math.min(1, bottom / correctionRange) : 0);
  const collect = () => {
    routes = [
      ...document.querySelectorAll<HTMLElement>(
        '.chat__mobile-route-view--messages'
      )
    ];
    scrollers = [
      ...document.querySelectorAll<HTMLElement>(
        '.chat__mobile-route-view--messages > .chat__message-viewport > .chat__message-wrapper'
      )
    ];
    moving = [
      ...document.querySelectorAll<HTMLElement>(
        '.chat__mobile-route-view--messages > :is(.chat__input, .call-topic-actions, .selected-messages, .chat__message-bubble__scroll-indicators), .chat__mobile-route-view--messages > .chat__message-viewport > .chat__message-wrapper'
      )
    ];
    for (const picker of document.querySelectorAll<HTMLElement>(
      '.chat__input .emoji-picker--open'
    )) {
      if (
        picker.contains(document.activeElement) &&
        document.activeElement?.matches('.v3-search input')
      )
        moving.push(picker);
      else picker.style.bottom = '';
    }
    for (const element of moving) {
      if (
        element.matches('.chat__input, .selected-messages, .emoji-picker--open')
      ) {
        element.style.willChange = '';
        element.style.translate = '';
      } else element.style.willChange = 'translate';
    }
  };
  const fixedBottom = (element: HTMLElement, bottom: number) =>
    element.matches('.emoji-picker--open')
      ? bottom +
        (element.closest<HTMLElement>('.chat__input')?.getBoundingClientRect()
          .height || 75) +
        5
      : bottom;
  const shift = (bottom: number) => {
    for (const element of moving) {
      if (
        element.matches('.chat__input, .selected-messages, .emoji-picker--open')
      ) {
        element.style.bottom = `${fixedBottom(element, bottom)}px`;
        continue;
      }
      element.style.translate = `0 ${-layerDelta(element, bottom)}px`;
    }
  };
  const settle = (nextBase: number, bottom: number) => {
    if (base === nextBase) {
      shift(bottom);
      return;
    }
    const snapshots = scrollers.map(element => ({
      element,
      top: element.scrollTop,
      max: Math.max(0, element.scrollHeight - element.clientHeight)
    }));
    base = nextBase;
    scrollCorrections.clear();
    correctionRange = nextBase === 0 ? bottom : 0;
    // Локальные свойства не инвалидируют стили всей ленты через наследуемую CSS-переменную.
    for (const route of routes) route.style.height = `calc(100% - ${base}px)`;
    for (const { element, top, max } of snapshots) {
      const desired =
        top + Math.max(0, element.scrollHeight - element.clientHeight) - max;
      element.scrollTop = desired;
      // У начала истории scrollTop ограничен нулём: остаток компенсируем слоем, без скачка.
      scrollCorrections.set(element, element.scrollTop - desired);
    }
    shift(bottom);
  };
  collect();
  root.classList.add('chat-android-ime');
  const update: KeyboardFrame = (physicalBottom, phase) => {
    cancelAnimations();
    const bottom = Math.max(0, physicalBottom / window.devicePixelRatio);
    const wasVisible = keyboardInset > 100;
    keyboardInset = bottom;
    if (phase === 'prepare') {
      collect();
      settle(0, bottom);
    } else if (phase === 'end') {
      collect();
      settle(bottom, bottom);
    } else shift(bottom);
    if (phase === 'end' || wasVisible !== bottom > 100)
      window.dispatchEvent(new Event(androidKeyboardEvent));
  };
  const animate: KeyboardAnimation = (
    physicalFrom,
    physicalTo,
    duration,
    startedAt,
    fractions
  ) => {
    cancelAnimations();
    const from = Math.max(0, physicalFrom / devicePixelRatio);
    const to = Math.max(0, physicalTo / devicePixelRatio);
    collect();
    settle(0, from);
    motion = { from, to, duration, startedAt, fractions };
    // Системная шкала IME передаётся один раз; лента обрезается неподвижной внешней областью.
    for (const element of moving) {
      const fixed = element.matches(
        '.chat__input, .selected-messages, .emoji-picker--open'
      );
      const composite =
        element.matches('.chat__input, .selected-messages') &&
        !element.querySelector('.emoji-picker--open') &&
        !element.querySelector('.attach-file-popover .active-yui-kit');
      if (composite) {
        element.style.bottom = '0px';
        element.style.willChange = 'translate';
      }
      const frames = (fractions || [0, 1]).map(fraction => {
        const bottom = from + (to - from) * fraction;
        if (fixed && !composite)
          return { bottom: `${fixedBottom(element, bottom)}px` };
        return {
          translate: `0 ${-(composite ? bottom : layerDelta(element, bottom))}px`
        };
      });
      const animation = element.animate(frames, {
        duration,
        easing: 'linear',
        fill: 'both'
      });
      animation.startTime = performance.now() + startedAt - Date.now();
      animations.push(animation);
    }
    window.dispatchEvent(new Event(androidKeyboardEvent));
  };
  return Object.assign(update, { animate });
}

export function initAndroidKeyboardViewport(): () => void {
  if (
    Capacitor.getPlatform() !== 'android' ||
    !Capacitor.isPluginAvailable('KeyboardViewport') ||
    !document.querySelector('.chat__mobile-route-view--messages')
  )
    return () => {};
  const update = createAndroidKeyboardViewport();
  activeViewport = update;
  window.__sepAndroidKeyboard = update;
  window.__sepAndroidKeyboardAnimate = update.animate;
  let enabled = true;
  const focusChanged = (event: FocusEvent) => {
    if (!(event.target instanceof Element)) return;
    const next = !!event.target.closest('.chat__input');
    if (next === enabled) return;
    enabled = next;
    // Формы настроек и поиск сохраняют обычную системную обработку клавиатуры.
    void (enabled ? nativeViewport.start() : nativeViewport.stop()).catch(
      () => {}
    );
  };
  document.addEventListener('focusin', focusChanged);
  void nativeViewport.start().catch(() => {});
  return () => {
    document.removeEventListener('focusin', focusChanged);
    if (activeViewport !== update) return;
    activeViewport = undefined;
    void nativeViewport.stop().catch(() => {});
    update(0, 'end');
    delete window.__sepAndroidKeyboard;
    delete window.__sepAndroidKeyboardAnimate;
    document.documentElement.classList.remove('chat-android-ime');
    for (const route of document.querySelectorAll<HTMLElement>(
      '.chat__mobile-route-view--messages'
    ))
      route.style.height = '';
  };
}
