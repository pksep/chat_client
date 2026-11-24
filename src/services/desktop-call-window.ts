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
import {
  callPresentationRequest,
  isModalVisible,
  state,
  open as callOpen
} from './useCallState';
import { desktopOverlayTarget } from './desktop-overlay-target';
import { createDesktopMicrophoneMeter } from './desktop-microphone-meter';
import {
  installDesktopCallActivityNotifications,
  type DesktopCallActivity
} from './desktop-call-activity';
import '../assets/desktop-call-window.css';
import { createDesktopCallHandAlert } from './desktop-call-hand-alert';
import { showTauriCallActivityNotification } from './useTauriNotifications';
import {
  desktopCallWindowOpening,
  desktopCallWindowReady,
  desktopCallPreparationRequested,
  cancelDesktopCallPreparation
} from './desktop-call-presentation';
import {
  isDesktopWindowActive,
  readDesktopWindowState
} from './desktop-window-state';

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
  notifyActivity?: (
    activity: DesktopCallActivity,
    options?: { soundPlayed?: boolean }
  ) => Promise<boolean>;
}) {
  if (!isTauri()) return null;
  const available = await invoke<boolean>(
    'desktop_call_window_available'
  ).catch(() => false);
  if (!available || options.signal.aborted) return null;
  return exclusive(async () => {
    if (options.signal.aborted) return null;
    let core: typeof import('./useLiveKit') | null = null;
    const coreReady = import('./useLiveKit');
    void coreReady
      .then(module => {
        core = module;
      })
      .catch(error =>
        console.warn('Не удалось подготовить движок звонка:', error)
      );
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
    let stopHandAlert: (() => void) | undefined;
    let unmount: (() => void) | undefined;
    let checkClosed: ReturnType<typeof setInterval> | undefined;
    let fullscreenChanges = Promise.resolve();
    let fullscreenRevision = 0;
    let fullscreenSettledRevision = 0;
    const actions: DesktopCallActions = {
      acceptCall: async () => (await coreReady).acceptCall(),
      leaveCall: async () => (await coreReady).leaveCall(),
      toggleMic: async () => (await coreReady).toggleMic(),
      toggleVideo: async () => (await coreReady).toggleVideo(),
      toggleScreenShare: async () => (await coreReady).toggleScreenShare(),
      switchCamera: async () => (await coreReady).switchCamera(),
      toggleHandRaise: async () => (await coreReady).toggleHandRaise(),
      sendCallReaction: async reaction =>
        (await coreReady).sendCallReaction(reaction),
      ...options.actions
    };
    const closeByUser = () => {
      if (!alive || closing) return;
      closing = true;
      const preparing = desktopCallPreparationRequested.value;
      cancelDesktopCallPreparation();
      if (!preparing || callOpen.value) void actions.leaveCall();
    };
    const clean = async () => {
      if (!alive) return;
      alive = false;
      desktopCallWindowReady.value = false;
      if (checkClosed) clearInterval(checkClosed);
      unlisten.splice(0).forEach(dispose => dispose());
      // Сначала возвращаем живые диалоги в основной документ, затем уничтожаем окно.
      if (desktopOverlayTarget.value === childDocument.body) {
        desktopOverlayTarget.value = 'body';
        await nextTick();
      }
      stopMeter?.();
      stopHandAlert?.();
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
        getTrack:
          options.getMicrophoneTrack ||
          (() => core?.getDesktopMicrophoneTrack() || null)
      });
      stopMeter = meter.dispose;
      const handAlert = createDesktopCallHandAlert({
        renderWindow: host,
        nativeWindow
      });
      stopHandAlert = handAlert.dispose;
      unlisten.push(
        await nativeWindow.onFocusChanged(({ payload }) => {
          if (payload) handAlert.clearAttention();
        })
      );
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
          const revision = ++fullscreenRevision;
          // Повторный вход в видео учитывает уже запрошенный выход, даже пока ОС
          // ещё меняет размер. Старые ответы не закрывают новый просмотр.
          context.fullscreen.value = enabled;
          doc.documentElement.classList.toggle(
            'chat-desktop-custom-chrome',
            !enabled
          );
          const change = fullscreenChanges.then(async () => {
            if (!alive) return;
            try {
              await nativeWindow.setFullscreen(enabled);
            } finally {
              const actual = await nativeWindow.isFullscreen();
              if (alive && revision === fullscreenRevision) {
                fullscreenSettledRevision = revision;
                context.fullscreen.value = actual;
                doc.documentElement.classList.toggle(
                  'chat-desktop-custom-chrome',
                  !actual
                );
              }
            }
          });
          fullscreenChanges = change.catch(() => {});
          return change;
        }
      };
      unlisten.push(
        installDesktopCallActivityNotifications({
          notify: activity => {
            const soundPlayed = activity.kind === 'hand' && handAlert.play();
            return (
              options.notifyActivity || showTauriCallActivityNotification
            )(activity, { soundPlayed });
          },
          isActive: async () => {
            if (!alive) return true;
            return readDesktopWindowState('call')
              .then(isDesktopWindowActive)
              .catch(() => false);
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
          if (fullscreenRevision !== fullscreenSettledRevision) return;
          const revision = fullscreenRevision;
          const actual = await nativeWindow.isFullscreen();
          if (
            alive &&
            revision === fullscreenRevision &&
            revision === fullscreenSettledRevision
          ) {
            context.fullscreen.value = actual;
            doc.documentElement.classList.toggle(
              'chat-desktop-custom-chrome',
              !actual
            );
          }
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
        desktopCallWindowOpening.value = true;
        try {
          await nativeWindow.unminimize();
          await nativeWindow.show();
          await nativeWindow.setFocus();
          if (alive) desktopCallWindowReady.value = true;
        } finally {
          desktopCallWindowOpening.value = false;
        }
      };
      const hide = async () => {
        if (alive) await nativeWindow.hide();
      };
      unlisten.push(
        watch(
          [
            isModalVisible,
            callPresentationRequest,
            desktopCallPreparationRequested
          ],
          ([visible]) => {
            void (
              visible || desktopCallPreparationRequested.value ? show() : hide()
            ).catch(error =>
              console.warn('Не удалось изменить видимость окна звонка:', error)
            );
          }
        )
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
