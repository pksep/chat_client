import { Capacitor } from '@capacitor/core';
import type { IUser } from '../components/interfaces/interfaces';
import { MAX_W_MD } from '../utils/constants';
import {
  activeGroupCalls,
  invitedGroupCall,
  isCalling,
  isIncoming,
  roomId,
  state as callMediaState,
  topicId,
  user,
  type ActiveGroupCallEntry
} from './useCallState';
import { isTauriRuntime } from './useTauriNotifications';

const CALL_WINDOW_LABEL = 'call-window';
const MAIN_WINDOW_LABEL = 'main';
const CALL_WINDOW_NAME = 'sep-chat-call-window';
const MAIN_WINDOW_NAME = 'sep-chat-main-window';
const CALL_WINDOW_MODAL_WIDTH = 700;
const CALL_WINDOW_MODAL_HEIGHT = 570;
const CALL_WINDOW_CHANNEL = 'sep-chat-call-window';
const CALL_WINDOW_CHAT_CHANNEL = 'sep-chat-call-window-chat';
const CALL_WINDOW_MESSAGE_TYPE = 'sep-chat:call-window-intent';
const CALL_WINDOW_CHAT_MESSAGE_TYPE = 'sep-chat:open-chat-request';
const CALL_WINDOW_TAURI_EVENT = 'sep-chat://call-window-intent';
const CALL_WINDOW_CHAT_TAURI_EVENT = 'sep-chat://open-chat-request';
const CALL_WINDOW_LATEST_INTENT_KEY = 'sep.chat.callWindow.latestIntentId';
const CALL_WINDOW_INTENT_PREFIX = 'sep.chat.callWindow.intent.';
const CALL_WINDOW_LATEST_CHAT_REQUEST_KEY =
  'sep.chat.callWindow.latestChatRequestId';
const CALL_WINDOW_CHAT_REQUEST_PREFIX = 'sep.chat.callWindow.chatRequest.';
const CALL_WINDOW_FEATURE_BASE =
  'popup=yes,resizable=yes,scrollbars=no,toolbar=no,location=no,menubar=no,status=no';

export type CallWindowIntentKind =
  | 'direct-outgoing'
  | 'group-start'
  | 'standalone-start'
  | 'incoming-direct'
  | 'join-group'
  | 'join-invite'
  | 'show-active';

export interface CallWindowMediaState {
  isMicActive: boolean;
  isVideoActive: boolean;
  isScreenSharingActive: boolean;
  isSpeakerActive: boolean;
}

export interface CallWindowIntent {
  id: string;
  callId: string;
  kind: CallWindowIntentKind;
  roomId?: string | null;
  topicId?: string | null;
  topicType?: string | null;
  user?: IUser | null;
  isIncoming?: boolean;
  isCalling?: boolean;
  startTime?: number | null;
  elapsedDurationMs?: number;
  activeGroupCall?: ActiveGroupCallEntry | null;
  invitedGroupCall?: typeof invitedGroupCall.value;
  mediaState?: CallWindowMediaState;
  createdAt: number;
}

export interface CallWindowChatRequest {
  id: string;
  topicId: string;
  topicType?: string | null;
  url: string;
  createdAt: number;
}

export type CallWindowIntentInput = Omit<
  CallWindowIntent,
  'id' | 'createdAt' | 'mediaState'
> & {
  id?: string;
  createdAt?: number;
  mediaState?: CallWindowMediaState;
};

let browserCallWindow: Window | null = null;

const getBreakpointPx = (): number => Number.parseFloat(MAX_W_MD);

const createId = (prefix: string): string => {
  const randomId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);

  return `${prefix}-${randomId}`;
};

export const createCallRoomId = (): string =>
  `livekit-${Math.random().toString(36).slice(2, 10)}`;

export const getCurrentCallMediaState = (): CallWindowMediaState => ({
  isMicActive: callMediaState.isMicActive,
  isVideoActive: callMediaState.isVideoActive,
  isScreenSharingActive: callMediaState.isScreenSharingActive,
  isSpeakerActive: callMediaState.isSpeakerActive
});

export const isPwaStandaloneRuntime = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
};

export const shouldUseSeparateCallWindow = (isMobile?: boolean): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  if (Capacitor.isNativePlatform()) {
    return false;
  }

  if (window.location.pathname.split('/').filter(Boolean)[0] === 'call') {
    return false;
  }

  if (typeof isMobile === 'boolean') {
    return !isMobile;
  }

  return window.innerWidth >= getBreakpointPx();
};

const isCallWindowRoute = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.pathname.split('/').filter(Boolean)[0] === 'call';
};

export const markMainChatWindow = (): void => {
  if (typeof window === 'undefined' || isCallWindowRoute()) {
    return;
  }

  window.name = MAIN_WINDOW_NAME;
};

export const markCallWindow = (): void => {
  if (typeof window === 'undefined' || !isCallWindowRoute()) {
    return;
  }

  window.name = CALL_WINDOW_NAME;
};

const getIntentStorageKey = (intentId: string): string =>
  `${CALL_WINDOW_INTENT_PREFIX}${intentId}`;

const getChatRequestStorageKey = (requestId: string): string =>
  `${CALL_WINDOW_CHAT_REQUEST_PREFIX}${requestId}`;

const getChatRouteUrl = (
  targetTopicId: string,
  targetTopicType?: string | null
) => {
  const isGroupTopic = targetTopicType?.toUpperCase() === 'GROUP';
  const routeType = isGroupTopic ? 'group' : 'dialogs';

  return new URL(
    `/${routeType}/${encodeURIComponent(targetTopicId)}`,
    window.location.origin
  ).toString();
};

const getBrowserCallWindowBounds = () => {
  const currentScreen = window.screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };
  const availableWidth = currentScreen.availWidth || window.outerWidth;
  const availableHeight = currentScreen.availHeight || window.outerHeight;
  const leftOffset = currentScreen.availLeft || 0;
  const topOffset = currentScreen.availTop || 0;
  const width = Math.min(CALL_WINDOW_MODAL_WIDTH, availableWidth);
  const height = Math.min(CALL_WINDOW_MODAL_HEIGHT, availableHeight);
  const left =
    leftOffset + Math.max(0, Math.round((availableWidth - width) / 2));
  const top =
    topOffset + Math.max(0, Math.round((availableHeight - height) / 2));

  return {
    width,
    height,
    left,
    top
  };
};

const getCallWindowFeatures = (): string => {
  const bounds = getBrowserCallWindowBounds();

  return [
    CALL_WINDOW_FEATURE_BASE,
    `width=${bounds.width}`,
    `height=${bounds.height}`,
    `left=${bounds.left}`,
    `top=${bounds.top}`
  ].join(',');
};

const resizeBrowserCallWindowToModal = (): void => {
  const bounds = getBrowserCallWindowBounds();

  try {
    window.resizeTo(bounds.width, bounds.height);
    window.moveTo(bounds.left, bounds.top);
  } catch (error) {
    console.warn('Failed to resize browser call window:', error);
  }
};

const resizeBrowserCallWindowToFullscreen = (): void => {
  const currentScreen = window.screen as Screen & {
    availLeft?: number;
    availTop?: number;
  };

  try {
    window.moveTo(currentScreen.availLeft || 0, currentScreen.availTop || 0);
    window.resizeTo(currentScreen.availWidth, currentScreen.availHeight);
  } catch (error) {
    console.warn('Failed to fullscreen browser call window:', error);
  }
};

const toCallWindowIntent = (
  intent: CallWindowIntentInput
): CallWindowIntent => ({
  ...intent,
  id: intent.id || createId('call-intent'),
  createdAt: intent.createdAt || Date.now(),
  mediaState: intent.mediaState || getCurrentCallMediaState()
});

const toChatRequest = (params: {
  topicId: string;
  topicType?: string | null;
}): CallWindowChatRequest => ({
  id: createId('call-chat-request'),
  topicId: params.topicId,
  topicType: params.topicType,
  url: getChatRouteUrl(params.topicId, params.topicType),
  createdAt: Date.now()
});

const persistCallWindowIntent = (intent: CallWindowIntent): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(getIntentStorageKey(intent.id), JSON.stringify(intent));
  localStorage.setItem(CALL_WINDOW_LATEST_INTENT_KEY, intent.id);
};

const persistChatRequest = (request: CallWindowChatRequest): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(
    getChatRequestStorageKey(request.id),
    JSON.stringify(request)
  );
  localStorage.setItem(CALL_WINDOW_LATEST_CHAT_REQUEST_KEY, request.id);
};

export const readStoredCallWindowIntent = (
  intentId?: string | null
): CallWindowIntent | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const resolvedIntentId =
    intentId || localStorage.getItem(CALL_WINDOW_LATEST_INTENT_KEY);

  if (!resolvedIntentId) {
    return null;
  }

  const rawIntent = localStorage.getItem(getIntentStorageKey(resolvedIntentId));

  if (!rawIntent) {
    return null;
  }

  try {
    return JSON.parse(rawIntent) as CallWindowIntent;
  } catch (error) {
    console.warn('Failed to parse call window intent:', error);
    return null;
  }
};

const readStoredChatRequest = (
  requestId?: string | null
): CallWindowChatRequest | null => {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  const resolvedRequestId =
    requestId || localStorage.getItem(CALL_WINDOW_LATEST_CHAT_REQUEST_KEY);

  if (!resolvedRequestId) {
    return null;
  }

  const rawRequest = localStorage.getItem(
    getChatRequestStorageKey(resolvedRequestId)
  );

  if (!rawRequest) {
    return null;
  }

  try {
    return JSON.parse(rawRequest) as CallWindowChatRequest;
  } catch (error) {
    console.warn('Failed to parse call window chat request:', error);
    return null;
  }
};

export const readCallWindowIntentFromUrl = (): CallWindowIntent | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(window.location.href);

  return readStoredCallWindowIntent(url.searchParams.get('intentId'));
};

const getCallWindowUrl = (intent: CallWindowIntent): string => {
  const url = new URL(
    `/call/${encodeURIComponent(intent.callId)}`,
    window.location.origin
  );

  url.searchParams.set('intentId', intent.id);

  return url.toString();
};

const broadcastCallWindowIntent = (intent: CallWindowIntent): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CALL_WINDOW_CHANNEL);
    channel.postMessage(intent);
    channel.close();
  }

  browserCallWindow?.postMessage(
    {
      type: CALL_WINDOW_MESSAGE_TYPE,
      intent
    },
    window.location.origin
  );
};

const broadcastChatRequest = (request: CallWindowChatRequest): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(CALL_WINDOW_CHAT_CHANNEL);
    channel.postMessage(request);
    channel.close();
  }

  window.opener?.postMessage(
    {
      type: CALL_WINDOW_CHAT_MESSAGE_TYPE,
      request
    },
    window.location.origin
  );
};

const emitTauriCallWindowIntent = async (
  intent: CallWindowIntent
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { emitTo } = await import('@tauri-apps/api/event');

    await emitTo(CALL_WINDOW_LABEL, CALL_WINDOW_TAURI_EVENT, intent);
  } catch (error) {
    console.warn('Failed to emit call window intent:', error);
  }
};

const emitTauriChatRequest = async (
  request: CallWindowChatRequest
): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { emitTo } = await import('@tauri-apps/api/event');

    await emitTo(MAIN_WINDOW_LABEL, CALL_WINDOW_CHAT_TAURI_EVENT, request);
  } catch (error) {
    console.warn('Failed to emit call window chat request:', error);
  }
};

const focusTauriMainWindow = async (): Promise<void> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const mainWindow = await WebviewWindow.getByLabel(MAIN_WINDOW_LABEL);

  await mainWindow?.unminimize().catch(() => {});
  await mainWindow?.show().catch(() => {});
  await mainWindow?.setFocus().catch(() => {});
};

const focusTauriWindow = async (callUrl: string): Promise<boolean> => {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existingWindow = await WebviewWindow.getByLabel(CALL_WINDOW_LABEL);

  if (existingWindow) {
    await existingWindow.unminimize().catch(() => {});
    await existingWindow.show().catch(() => {});
    await existingWindow.setFocus().catch(() => {});
    return true;
  }

  const callWindow = new WebviewWindow(CALL_WINDOW_LABEL, {
    url: callUrl,
    title: 'SEP Chat Call',
    center: true,
    width: CALL_WINDOW_MODAL_WIDTH,
    height: CALL_WINDOW_MODAL_HEIGHT,
    minWidth: CALL_WINDOW_MODAL_WIDTH,
    minHeight: CALL_WINDOW_MODAL_HEIGHT,
    decorations: false,
    shadow: true,
    resizable: true,
    focus: true,
    visible: true
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      resolve();
    }, 1500);

    void callWindow.once('tauri://created', () => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      resolve();
    });

    void callWindow.once('tauri://error', event => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      reject(event.payload);
    });
  });

  await callWindow.setFocus().catch(() => {});
  return true;
};

const openTauriCallWindow = async (
  intent: CallWindowIntent
): Promise<boolean> => {
  const callUrl = getCallWindowUrl(intent);

  try {
    const didFocus = await focusTauriWindow(callUrl);
    await emitTauriCallWindowIntent(intent);
    return didFocus;
  } catch (error) {
    console.warn('Failed to open Tauri call window:', error);
    window.location.assign(callUrl);
    return true;
  }
};

const openBrowserCallWindow = async (
  intent: CallWindowIntent
): Promise<boolean> => {
  const callUrl = getCallWindowUrl(intent);

  markMainChatWindow();

  if (browserCallWindow && !browserCallWindow.closed) {
    browserCallWindow.focus();
    broadcastCallWindowIntent(intent);
    return true;
  }

  browserCallWindow = window.open(
    callUrl,
    CALL_WINDOW_NAME,
    getCallWindowFeatures()
  );

  if (browserCallWindow) {
    browserCallWindow.focus();
    broadcastCallWindowIntent(intent);
    return true;
  }

  window.location.assign(callUrl);
  return true;
};

export const openCallWindowIntent = async (
  intentInput: CallWindowIntentInput,
  options: { isMobile?: boolean } = {}
): Promise<boolean> => {
  if (!shouldUseSeparateCallWindow(options.isMobile)) {
    return false;
  }

  const intent = toCallWindowIntent(intentInput);

  persistCallWindowIntent(intent);

  if (isTauriRuntime()) {
    return openTauriCallWindow(intent);
  }

  return openBrowserCallWindow(intent);
};

export const openCurrentCallWindow = async (
  options: { isMobile?: boolean } = {}
): Promise<boolean> => {
  const activeCallId = roomId.value || topicId.value || createCallRoomId();

  return openCallWindowIntent(
    {
      callId: activeCallId,
      kind: 'show-active',
      roomId: roomId.value,
      topicId: topicId.value,
      user: user.value,
      isIncoming: isIncoming.value,
      isCalling: isCalling.value,
      activeGroupCall: topicId.value
        ? activeGroupCalls.value[topicId.value] || null
        : null,
      invitedGroupCall: invitedGroupCall.value,
      mediaState: getCurrentCallMediaState()
    },
    options
  );
};

export const openChatFromCallWindow = async (params: {
  topicId: string;
  topicType?: string | null;
}): Promise<boolean> => {
  if (typeof window === 'undefined' || !params.topicId) {
    return false;
  }

  const request = toChatRequest(params);

  persistChatRequest(request);
  broadcastChatRequest(request);

  if (isTauriRuntime()) {
    await emitTauriChatRequest(request);
    await focusTauriMainWindow().catch(error => {
      console.warn('Failed to focus Tauri main window:', error);
    });
    return true;
  }

  const mainWindow = window.open(request.url, MAIN_WINDOW_NAME);
  mainWindow?.focus();

  return true;
};

export const closeCurrentCallWindow = async (): Promise<void> => {
  if (typeof window === 'undefined' || !isCallWindowRoute()) {
    return;
  }

  if (isTauriRuntime()) {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');

      await getCurrentWindow().close();
      return;
    } catch (error) {
      console.warn('Failed to close Tauri call window:', error);
    }
  }

  window.close();
};

export const setCurrentCallWindowFullscreen = async (
  isFullscreen: boolean
): Promise<void> => {
  if (typeof window === 'undefined' || !isCallWindowRoute()) {
    return;
  }

  if (isTauriRuntime()) {
    try {
      const { getCurrentWindow, LogicalSize } = await import(
        '@tauri-apps/api/window'
      );
      const currentWindow = getCurrentWindow();

      await currentWindow.setFullscreen(isFullscreen);

      if (!isFullscreen) {
        await currentWindow.setSize(
          new LogicalSize(CALL_WINDOW_MODAL_WIDTH, CALL_WINDOW_MODAL_HEIGHT)
        );
        await currentWindow.center();
      }

      return;
    } catch (error) {
      console.warn('Failed to update Tauri call window fullscreen:', error);
    }
  }

  if (isFullscreen) {
    await document.documentElement.requestFullscreen?.().catch(error => {
      console.warn('Failed to request browser fullscreen:', error);
    });
    resizeBrowserCallWindowToFullscreen();
    return;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen?.().catch(error => {
      console.warn('Failed to exit browser fullscreen:', error);
    });
  }

  resizeBrowserCallWindowToModal();
};

export const startCurrentCallWindowDrag = async (): Promise<void> => {
  if (
    typeof window === 'undefined' ||
    !isCallWindowRoute() ||
    !isTauriRuntime()
  ) {
    return;
  }

  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');

    await getCurrentWindow().startDragging();
  } catch (error) {
    console.warn('Failed to drag Tauri call window:', error);
  }
};

export const subscribeToCallWindowIntents = (
  callback: (intent: CallWindowIntent) => void
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let broadcastChannel: BroadcastChannel | null = null;
  let tauriUnlisten: (() => void) | null = null;

  const handleIntent = (intent: CallWindowIntent | null): void => {
    if (!intent) {
      return;
    }

    callback(intent);
  };

  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(CALL_WINDOW_CHANNEL);
    broadcastChannel.onmessage = event => {
      handleIntent(event.data as CallWindowIntent);
    };
  }

  const handleStorage = (event: StorageEvent): void => {
    if (event.key === CALL_WINDOW_LATEST_INTENT_KEY) {
      handleIntent(readStoredCallWindowIntent(event.newValue));
      return;
    }

    if (!event.key?.startsWith(CALL_WINDOW_INTENT_PREFIX) || !event.newValue) {
      return;
    }

    try {
      handleIntent(JSON.parse(event.newValue) as CallWindowIntent);
    } catch (error) {
      console.warn('Failed to parse call window storage event:', error);
    }
  };

  const handleMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) {
      return;
    }

    const data = event.data as {
      type?: string;
      intent?: CallWindowIntent;
    };

    if (data?.type === CALL_WINDOW_MESSAGE_TYPE) {
      handleIntent(data.intent || null);
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('message', handleMessage);

  if (isTauriRuntime()) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<CallWindowIntent>(CALL_WINDOW_TAURI_EVENT, event => {
          handleIntent(event.payload);
        })
      )
      .then(unlisten => {
        tauriUnlisten = unlisten;
      })
      .catch(error => {
        console.warn('Failed to listen call window intents:', error);
      });
  }

  return () => {
    broadcastChannel?.close();
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('message', handleMessage);
    tauriUnlisten?.();
  };
};

export const subscribeToCallWindowChatRequests = (
  callback: (request: CallWindowChatRequest) => void
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let broadcastChannel: BroadcastChannel | null = null;
  let tauriUnlisten: (() => void) | null = null;

  const handleRequest = (request: CallWindowChatRequest | null): void => {
    if (!request?.topicId) {
      return;
    }

    callback(request);
  };

  if (typeof BroadcastChannel !== 'undefined') {
    broadcastChannel = new BroadcastChannel(CALL_WINDOW_CHAT_CHANNEL);
    broadcastChannel.onmessage = event => {
      handleRequest(event.data as CallWindowChatRequest);
    };
  }

  const handleStorage = (event: StorageEvent): void => {
    if (event.key === CALL_WINDOW_LATEST_CHAT_REQUEST_KEY) {
      handleRequest(readStoredChatRequest(event.newValue));
      return;
    }

    if (
      !event.key?.startsWith(CALL_WINDOW_CHAT_REQUEST_PREFIX) ||
      !event.newValue
    ) {
      return;
    }

    try {
      handleRequest(JSON.parse(event.newValue) as CallWindowChatRequest);
    } catch (error) {
      console.warn('Failed to parse call window chat storage event:', error);
    }
  };

  const handleMessage = (event: MessageEvent): void => {
    if (event.origin !== window.location.origin) {
      return;
    }

    const data = event.data as {
      type?: string;
      request?: CallWindowChatRequest;
    };

    if (data?.type === CALL_WINDOW_CHAT_MESSAGE_TYPE) {
      handleRequest(data.request || null);
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('message', handleMessage);

  if (isTauriRuntime()) {
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen<CallWindowChatRequest>(CALL_WINDOW_CHAT_TAURI_EVENT, event => {
          handleRequest(event.payload);
        })
      )
      .then(unlisten => {
        tauriUnlisten = unlisten;
      })
      .catch(error => {
        console.warn('Failed to listen call window chat requests:', error);
      });
  }

  return () => {
    broadcastChannel?.close();
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('message', handleMessage);
    tauriUnlisten?.();
  };
};
