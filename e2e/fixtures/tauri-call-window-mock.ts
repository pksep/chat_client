import type { Page } from '@playwright/test';

export async function installTauriCallWindowMock(page: Page) {
  await page.addInitScript(() => {
    const win = window as any;
    const nativeOpen = win.open.bind(win);
    let callPopup: Window | null = null;
    const namedSurfaces = new Map<string, Window>();
    win.open = (url?: string | URL, target?: string, features?: string) => {
      if (win.callRetainClosedTarget && target && namedSurfaces.has(target))
        return namedSurfaces.get(target);
      const popup = nativeOpen(url, target, features);
      if (String(url) === 'about:blank#sep-chat-call') {
        callPopup = popup;
        if (target && popup) namedSurfaces.set(target, popup);
      }
      return popup;
    };
    win.deliveredCallActivities = [];
    win.callControlsSnapshots = [];
    win.callAttentionRequests = [];
    win.isTauri = true;
    let id = 0;
    const callbacks = new Map();
    const listeners: any[] = [];
    const windows: Record<string, any> = {
      main: {
        alwaysOnTop: false,
        visible: true,
        minimized: false,
        maximized: false,
        fullscreen: false,
        focused: true
      },
      call: {
        alwaysOnTop: false,
        visible: false,
        minimized: false,
        maximized: false,
        fullscreen: false,
        focused: false
      }
    };
    const emit = (label: string, event: string) =>
      listeners
        .filter(item => item.target.label === label && item.event === event)
        .forEach(item =>
          callbacks.get(item.handler)?.({
            event,
            payload: { width: 960, height: 720 }
          })
        );
    win.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    win.__TAURI_INTERNALS__ = {
      metadata: {
        currentWindow: { label: 'main' },
        currentWebview: { label: 'main' }
      },
      transformCallback: (callback: any) => {
        callbacks.set(++id, callback);
        return id;
      },
      invoke: async (command: string, args: any = {}) => {
        if (command === 'plugin:window|request_user_attention') {
          win.callAttentionRequests.push(args);
          return;
        }
        if (command === 'desktop_sync_call_controls') {
          win.callControlsSnapshots.push(args.snapshot);
          return;
        }
        if (command === 'desktop_window_state')
          return {
            label: args.label || 'main',
            ...windows[args.label || 'main']
          };
        if (command === 'desktop_notification_permission') return true;
        if (command === 'show_windows_notification') {
          if (args.tag.length > 64)
            throw new Error('The size of the notification tag is too large');
          win.deliveredCallActivities.push(args);
          return true;
        }
        if (command === 'plugin:event|emit') {
          listeners
            .filter(item => item.event === args.event)
            .forEach(item =>
              callbacks.get(item.handler)?.({
                event: args.event,
                payload: args.payload
              })
            );
          return;
        }
        if (command === 'desktop_call_window_available') return true;
        if (command === 'desktop_call_window_capabilities')
          return {
            available: true,
            version: '0.0.0-test',
            os: win.callLinux ? 'linux' : 'windows',
            pinSupported: win.callPinSupported !== false
          };
        if (command === 'desktop_call_window_pinned')
          return windows.call.alwaysOnTop;
        if (command === 'desktop_call_window_fullscreen')
          return windows.call.wmFullscreen || false;
        if (command === 'desktop_close_call_window') {
          callPopup?.close();
          callPopup = null;
          return;
        }
        if (command === 'plugin:event|listen') {
          listeners.push(args);
          return args.handler;
        }
        if (command === 'plugin:event|unlisten') return;
        const state = windows[args.label || 'main'];
        switch (command) {
          case 'plugin:window|is_always_on_top':
            return state.alwaysOnTop;
          case 'plugin:window|set_always_on_top':
            if (win.callPinRejected)
              throw new Error('Оконная система отказала');
            state.alwaysOnTop = args.value;
            return;
          case 'plugin:window|is_decorated':
            return false;
          case 'plugin:window|is_fullscreen':
            return state.fullscreen;
          case 'plugin:window|is_maximized':
            return state.maximized;
          case 'plugin:window|is_minimized':
            return state.minimized;
          case 'plugin:window|is_visible':
            return state.visible;
          case 'plugin:window|is_focused':
            return state.focused;
          case 'plugin:window|set_focus':
            Object.values(windows).forEach(item => {
              item.focused = false;
            });
            state.focused = true;
            return;
          case 'plugin:window|inner_size':
            return state.size || { width: 960, height: 720 };
          case 'plugin:window|scale_factor':
            return 1;
          case 'plugin:window|set_size':
            state.size = args.value.size || args.value.Logical;
            emit(args.label, 'tauri://resize');
            return;
          case 'plugin:window|minimize':
            state.minimized = true;
            state.focused = false;
            return;
          case 'plugin:window|unminimize':
            state.minimized = false;
            return;
          case 'plugin:window|toggle_maximize':
            state.maximized = !state.maximized;
            emit(args.label, 'tauri://resize');
            return;
          case 'plugin:window|set_fullscreen':
            state.fullscreen = args.value;
            if (win.callLinux) {
              setTimeout(() => {
                state.wmFullscreen = args.value;
                if (!args.value) state.alwaysOnTop = false;
                emit(args.label, 'tauri://resize');
              }, 100);
            } else state.wmFullscreen = args.value;
            emit(args.label, 'tauri://resize');
            return;
          case 'plugin:window|hide':
            state.visible = false;
            state.focused = false;
            return;
          case 'plugin:window|show':
            state.visible = true;
            return;
          case 'plugin:window|close':
            if (args.label === 'main') state.visible = false;
            else emit(args.label, 'tauri://close-requested');
            return;
          default:
            return null;
        }
      }
    };
  });
}
