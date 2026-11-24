import {
  createRenderer,
  h,
  nextTick,
  nodeOps,
  patchProp,
  ref,
  toRef,
  watch,
  type AppContext
} from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  Window as TauriWindow,
  getCurrentWindow
} from '@tauri-apps/api/window';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { LogicalSize } from '@tauri-apps/api/dpi';
import DesktopCallSurface from '../components/Desktop/DesktopCallSurface.vue';
import type {
  CallRenderWindow,
  DesktopCallActions,
  DesktopCallWindowContext
} from '../components/Desktop/call-window-context';
import { callPresentationRequest, isModalVisible, state } from './useCallState';
import { desktopOverlayTarget } from './desktop-overlay-target';
import { createDesktopMicrophoneMeter } from './desktop-microphone-meter';
import {
  installDesktopCallActivityNotifications,
  type DesktopCallActivity
} from './desktop-call-activity';
import '../assets/desktop-call-window.css';

let lifecycle: Promise<unknown> = Promise.resolve();
const measureWebCallDialog = () => {
  const surface = document.createElement('div');
  surface.className = 'call-modal';
  surface.setAttribute('aria-hidden', 'true');
  surface.style.cssText = 'visibility:hidden;pointer-events:none';
  const dialog = document.createElement('div');
  dialog.className = 'call-modal__container';
  surface.append(dialog);
  document.body.append(surface);
  try {
    const bounds = dialog.getBoundingClientRect();
    const titlebarHeight =
      parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          '--desktop-titlebar-height'
        )
      ) || 0;
    return new LogicalSize(
      Math.ceil(bounds.width),
      Math.ceil(bounds.height + titlebarHeight)
    );
  } finally {
    surface.remove();
  }
};
const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
  const result = lifecycle.then(operation, operation);
  lifecycle = result.catch(() => {});
  return result;
};

const copyWindowPresentation = (target: Document): (() => void) => {
  const source = document;
  const copies = new Map<Element, Element>();
  const syncStyles = () => {
    const styles = new Set(
      source.head.querySelectorAll('style, link[rel="stylesheet"]')
    );
    copies.forEach((copy, original) => {
      if (!styles.has(original)) {
        copy.remove();
        copies.delete(original);
      }
    });
    styles.forEach(original => {
      let copy = copies.get(original);
      if (!copy) {
        copy = original.cloneNode(true) as Element;
        target.head.append(copy);
        copies.set(original, copy);
      }
      if (
        original.tagName === 'STYLE' &&
        copy.textContent !== original.textContent
      )
        copy.textContent = original.textContent;
      if (
        original.tagName === 'LINK' &&
        copy.getAttribute('href') !== original.getAttribute('href')
      )
        copy.setAttribute('href', original.getAttribute('href') || '');
    });
  };
  const syncTheme = () => {
    for (const name of ['lang', 'data-theme', 'style']) {
      const value = source.documentElement.getAttribute(name);
      if (value === null) target.documentElement.removeAttribute(name);
      else target.documentElement.setAttribute(name, value);
    }
    for (const name of ['theme-dark', 'theme-light'])
      target.documentElement.classList.toggle(
        name,
        source.documentElement.classList.contains(name)
      );
    target.body.className = source.body.className;
    target.body.classList.add('desktop-call-window');
  };
  syncStyles();
  syncTheme();
  const stylesObserver = new MutationObserver(syncStyles);
  stylesObserver.observe(source.head, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true
  });
  const themeObserver = new MutationObserver(syncTheme);
  themeObserver.observe(source.documentElement, {
    attributes: true,
    attributeFilter: ['class', 'data-theme', 'style']
  });
  themeObserver.observe(source.body, {
    attributes: true,
    attributeFilter: ['class']
  });
  return () => {
    stylesObserver.disconnect();
    themeObserver.disconnect();
  };
};

export async function openDesktopCallWindow(options: {
  appContext: AppContext;
  signal: AbortSignal;
  actions?: Partial<DesktopCallActions>;
  getMicrophoneTrack?: () => MediaStreamTrack | null;
  notifyActivity?: (activity: DesktopCallActivity) => Promise<boolean>;
}) {
  if (!isTauri()) return null;
  const available = await invoke<boolean>(
    'desktop_call_window_available'
  ).catch(() => false);
  if (!available || options.signal.aborted) return null;
  return exclusive(async () => {
    if (options.signal.aborted) return null;
    const core = await import('./useLiveKit');
    if (options.signal.aborted) return null;
    const initialSize = measureWebCallDialog();
    const popup = window.open(
      'about:blank#sep-chat-call',
      'sep-chat-call',
      `popup,width=${initialSize.width},height=${initialSize.height}`
    );
    if (!popup) throw new Error('Не удалось открыть отдельное окно звонка');
    const host = popup as CallRenderWindow;
    const nativeWindow = new TauriWindow('call');
    const childDocument = host.document;
    const unlisten: UnlistenFn[] = [];
    let alive = true;
    let closing = false;
    let stopPresentation: (() => void) | undefined;
    let stopMeter: (() => void) | undefined;
    let unmount: (() => void) | undefined;
    let checkClosed: ReturnType<typeof setInterval> | undefined;
    let fullscreenChanges = Promise.resolve();
    const actions: DesktopCallActions = {
      acceptCall: core.acceptCall,
      leaveCall: core.leaveCall,
      toggleMic: core.toggleMic,
      toggleVideo: core.toggleVideo,
      toggleScreenShare: core.toggleScreenShare,
      switchCamera: core.switchCamera,
      toggleHandRaise: core.toggleHandRaise,
      sendCallReaction: core.sendCallReaction,
      ...options.actions
    };
    const closeByUser = () => {
      if (!alive || closing) return;
      closing = true;
      void actions.leaveCall();
    };
    const clean = async () => {
      if (!alive) return;
      alive = false;
      if (checkClosed) clearInterval(checkClosed);
      unlisten.splice(0).forEach(dispose => dispose());
      // Сначала возвращаем живые диалоги в основной документ, затем уничтожаем окно.
      if (desktopOverlayTarget.value === childDocument.body) {
        desktopOverlayTarget.value = 'body';
        await nextTick();
      }
      stopMeter?.();
      unmount?.();
      stopPresentation?.();
      await invoke('desktop_close_call_window');
    };
    try {
      const deadline = Date.now() + 5000;
      while (!host.document.body) {
        if (options.signal.aborted || host.closed || Date.now() > deadline)
          throw new Error('Окно звонка не подготовилось');
        await new Promise(resolve => setTimeout(resolve, 16));
      }
      if (options.signal.aborted) {
        await clean();
        return null;
      }
      const doc = host.document;
      await nativeWindow.setSize(initialSize);
      await nativeWindow.center();
      const preventContextMenu = (event: Event) => event.preventDefault();
      doc.addEventListener('contextmenu', preventContextMenu);
      unlisten.push(() =>
        doc.removeEventListener('contextmenu', preventContextMenu)
      );
      const base = doc.createElement('base');
      base.href = document.baseURI;
      doc.head.append(base);
      doc.title = 'Звонок — СЭП Чат';
      doc.documentElement.classList.add(
        'desktop-call-window',
        'chat-desktop-custom-chrome'
      );
      stopPresentation = copyWindowPresentation(doc);
      await Promise.all(
        Array.from(
          doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
          link => {
            if (link.sheet) return Promise.resolve();
            return new Promise<void>((resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('Не загрузились стили окна звонка')),
                10_000
              );
              const finish = (error?: Error) => {
                clearTimeout(timer);
                if (error) reject(error);
                else resolve();
              };
              link.addEventListener('load', () => finish(), { once: true });
              link.addEventListener(
                'error',
                () => finish(new Error('Не загрузились стили окна звонка')),
                { once: true }
              );
            });
          }
        )
      );
      const meter = createDesktopMicrophoneMeter({
        renderWindow: host,
        enabled: toRef(state, 'isMicActive'),
        getTrack: options.getMicrophoneTrack || core.getDesktopMicrophoneTrack
      });
      stopMeter = meter.dispose;
      const context: DesktopCallWindowContext = {
        renderWindow: host,
        nativeWindow,
        width: ref(host.innerWidth),
        fullscreen: ref(false),
        microphoneLevel: meter.audioLevel,
        microphoneSpeaking: meter.speaking,
        contextMenuOpen: ref(false),
        actions,
        async showMain() {
          const main = getCurrentWindow();
          await main.unminimize();
          await main.show();
          await main.setFocus();
        },
        async toggleFullscreen() {
          await context.setFullscreen(!(await nativeWindow.isFullscreen()));
        },
        setFullscreen(enabled) {
          const change = fullscreenChanges.then(async () => {
            if (!alive) return;
            await nativeWindow.setFullscreen(enabled);
            context.fullscreen.value = await nativeWindow.isFullscreen();
            doc.documentElement.classList.toggle(
              'chat-desktop-custom-chrome',
              !context.fullscreen.value
            );
          });
          fullscreenChanges = change.catch(() => {});
          return change;
        }
      };
      unlisten.push(
        installDesktopCallActivityNotifications({
          notify: options.notifyActivity,
          isActive: async () => {
            if (!alive) return true;
            const [focused, visible, minimized] = await Promise.all([
              nativeWindow.isFocused(),
              nativeWindow.isVisible(),
              nativeWindow.isMinimized()
            ]);
            return focused && visible && !minimized;
          }
        })
      );
      const resize = () => {
        context.width.value = host.innerWidth;
      };
      host.addEventListener('resize', resize);
      unlisten.push(() => host.removeEventListener('resize', resize));
      unlisten.push(
        await nativeWindow.onResized(async () => {
          if (!alive) return;
          resize();
          context.fullscreen.value = await nativeWindow.isFullscreen();
        })
      );
      unlisten.push(
        await nativeWindow.onCloseRequested(event => {
          event.preventDefault();
          closeByUser();
        })
      );
      const root = doc.createElement('div');
      doc.body.append(root);
      // Отдельный DOM-renderer направляет вложенные Teleport (настройки, меню) в
      // документ звонка, сохраняя Vue-состояние и единственный RTC в основном JS.
      const renderer = createRenderer<Node, Element>({
        ...nodeOps,
        patchProp,
        querySelector: selector => doc.querySelector(selector)
      });
      const vnode = h(DesktopCallSurface, { context });
      vnode.appContext = options.appContext;
      renderer.render(vnode, root);
      unmount = () => {
        renderer.render(null, root);
        root.remove();
      };
      desktopOverlayTarget.value = doc.body;
      await nextTick();
      if (options.signal.aborted) {
        await clean();
        return null;
      }
      checkClosed = setInterval(() => {
        if (alive && host.closed) closeByUser();
      }, 300);
      const show = async () => {
        if (!alive) return;
        await nativeWindow.unminimize();
        await nativeWindow.show();
        await nativeWindow.setFocus();
      };
      const hide = async () => {
        if (alive) await nativeWindow.hide();
      };
      unlisten.push(
        watch([isModalVisible, callPresentationRequest], ([visible]) => {
          void (visible ? show() : hide()).catch(error =>
            console.warn('Не удалось изменить видимость окна звонка:', error)
          );
        })
      );
      return {
        context,
        popup: host,
        show,
        hide,
        showMain: context.showMain,
        dispose: () => exclusive(clean)
      };
    } catch (error) {
      await clean();
      throw error;
    }
  });
}
