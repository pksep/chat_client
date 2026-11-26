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
  open as callOpen,
  roomId as callRoomId
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
import { waitForDesktopCallDocument } from './desktop-call-document';
import { setDesktopCallPinned } from './desktop-call-pin';
import { waitForDesktopCallFullscreen } from './desktop-call-fullscreen';
import { getTelemetryErrorPayload, recordTelemetryEvent } from './useTelemetry';

interface CallWindowCapabilities {
  available: boolean;
  version?: string;
  os?: string;
  pinSupported: boolean;
  lastError?: string;
}

let lifecycle: Promise<unknown> = Promise.resolve();
let callSurfaceSequence = 0;
const initialCallWindowSize = () =>
  // Самостоятельное окно сразу показывает сетку на шесть участников.
  new LogicalSize(
    Math.min(960, window.screen.availWidth || 960),
    Math.min(720, window.screen.availHeight || 720)
  );
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
  const capabilities = await invoke<CallWindowCapabilities>(
    'desktop_call_window_capabilities',
    { prepare: true }
  )
    .then(value => {
      if (!value) throw new Error('Нет сведений об оболочке');
      return value;
    })
    .catch(
      async () =>
        ({
          available: await invoke<boolean>(
            'desktop_call_window_available'
          ).catch(() => false),
          pinSupported: !/Linux/i.test(navigator.userAgent)
        }) as CallWindowCapabilities
    );
  const startedAt = performance.now();
  let stage = 'availability';
  const record = (event: string, error?: unknown) =>
    recordTelemetryEvent({
      category: 'call',
      name: `call.window.${event}`,
      level: error ? 'warn' : 'info',
      entityType: 'call',
      entityId: callRoomId.value || undefined,
      payload: {
        stage,
        roomId: callRoomId.value,
        nativeVersion: capabilities.version,
        nativeOs: capabilities.os,
        elapsedMs: Math.round(performance.now() - startedAt),
        ...(error ? getTelemetryErrorPayload(error) : {})
      }
    });
  if (options.signal.aborted) return null;
  if (!capabilities.available) {
    record('unavailable');
    return null;
  }
  return exclusive(async () => {
    if (options.signal.aborted) return null;
    record('opening');
    let core: typeof import('./useLiveKit') | null = null;
    const coreReady = import('./useLiveKit');
    void coreReady
      .then(module => {
        core = module;
      })
      .catch(error =>
        console.warn('Не удалось подготовить движок звонка:', error)
      );
    const initialSize = initialCallWindowSize();
    stage = 'popup';
    const popup = window.open(
      'about:blank#sep-chat-call',
      // WKWebView может удерживать именованный контекст после native destroy.
      `sep-chat-call-${Date.now()}-${++callSurfaceSequence}`,
      `popup,width=${initialSize.width},height=${initialSize.height}`
    );
    if (!popup) {
      const diagnostic = await invoke<CallWindowCapabilities>(
        'desktop_call_window_capabilities'
      ).catch(() => null);
      const error = new Error(
        `Не удалось открыть отдельное окно звонка: ${diagnostic?.lastError || 'popup-blocked'}`
      );
      record('failed', error);
      throw error;
    }
    const host = popup as CallRenderWindow;
    const nativeWindow = new TauriWindow('call');
    const pinWindow = {
      setAlwaysOnTop: (enabled: boolean) =>
        nativeWindow.setAlwaysOnTop(enabled),
      isAlwaysOnTop: () =>
        capabilities.os === 'linux'
          ? invoke<boolean>('desktop_call_window_pinned')
          : nativeWindow.isAlwaysOnTop()
    };
    let childDocument: Document | undefined;
    const unlisten: UnlistenFn[] = [];
    let alive = true;
    let closing = false;
    let stopPresentation: (() => void) | undefined;
    let stopMeter: (() => void) | undefined;
    let stopHandAlert: (() => void) | undefined;
    let unmount: (() => void) | undefined;
    let checkClosed: ReturnType<typeof setInterval> | undefined;
    let fullscreenChanges = Promise.resolve();
    let pinChange = Promise.resolve();
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
      await Promise.allSettled(
        unlisten.splice(0).map(dispose => Promise.resolve().then(dispose))
      );
      // Сначала возвращаем живые диалоги в основной документ, затем уничтожаем окно.
      if (childDocument && desktopOverlayTarget.value === childDocument.body) {
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
      stage = 'document';
      const doc = await waitForDesktopCallDocument(host, options.signal);
      if (options.signal.aborted) {
        await clean();
        return null;
      }
      childDocument = doc;
      stage = 'size';
      await nativeWindow.setSize(initialSize);
      // Wayland не предоставляет приложению глобальные координаты окна.
      await nativeWindow.center().catch(() => undefined);
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
      stage = 'styles';
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
        alwaysOnTop: ref(false),
        pinSupported: capabilities.pinSupported,
        pinChanging: ref(false),
        async toggleAlwaysOnTop() {
          if (
            !alive ||
            !context.pinSupported ||
            context.pinChanging.value ||
            context.fullscreen.value
          )
            return;
          context.pinChanging.value = true;
          const change = (async () => {
            try {
              const enabled = !context.alwaysOnTop.value;
              await setDesktopCallPinned(pinWindow, enabled);
              context.alwaysOnTop.value = enabled;
            } finally {
              context.pinChanging.value = false;
            }
          })();
          pinChange = change.catch(() => undefined);
          return change;
        },
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
            await pinChange;
            try {
              if (enabled && context.alwaysOnTop.value)
                await setDesktopCallPinned(pinWindow, false);
              await nativeWindow.setFullscreen(enabled);
              await waitForDesktopCallFullscreen(
                nativeWindow,
                enabled,
                () => alive
              );
            } catch (error) {
              if (alive) throw error;
            } finally {
              if (alive) {
                const actual = await nativeWindow
                  .isFullscreen()
                  .catch(error => {
                    if (alive) throw error;
                    return enabled;
                  });
                if (alive && revision === fullscreenRevision) {
                  fullscreenSettledRevision = revision;
                  context.fullscreen.value = actual;
                  doc.documentElement.classList.toggle(
                    'chat-desktop-custom-chrome',
                    !actual
                  );
                  if (!actual && context.alwaysOnTop.value) {
                    await setDesktopCallPinned(pinWindow, true);
                    context.alwaysOnTop.value = await pinWindow.isAlwaysOnTop();
                  }
                }
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
      const refreshNativeWindow = async () => {
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
          if (!actual && context.alwaysOnTop.value) {
            await setDesktopCallPinned(pinWindow, true);
            context.alwaysOnTop.value = await pinWindow.isAlwaysOnTop();
          }
          doc.documentElement.classList.toggle(
            'chat-desktop-custom-chrome',
            !actual
          );
        }
      };
      unlisten.push(
        await nativeWindow.onResized(() => {
          void refreshNativeWindow().catch(error => {
            if (alive) {
              record('state-failed', error);
              console.warn('Не удалось обновить состояние окна звонка:', error);
            }
          });
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
          stage = 'show';
          await nativeWindow.unminimize();
          await nativeWindow.show();
          await nativeWindow.setFocus();
          if (alive) desktopCallWindowReady.value = true;
          record('shown');
        } catch (error) {
          record('failed', error);
          throw error;
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
      record(options.signal.aborted ? 'cancelled' : 'failed', error);
      await clean().catch(() => undefined);
      throw error;
    }
  });
}
