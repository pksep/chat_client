import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';

type NativeCallAction = 'accept' | 'decline';

interface CallActionPayload {
  action?: string;
  roomId?: string;
  topicId?: string;
}

interface CallScreenPlugin {
  showIncomingCallScreen(): Promise<void>;
  hideIncomingCallScreen(): Promise<void>;
  showIncomingCall(options: {
    callerName?: string;
    roomId: string;
    topicId?: string;
  }): Promise<void>;
  dismissIncomingCall(options?: { roomId?: string }): Promise<void>;
  consumePendingCallAction(): Promise<CallActionPayload>;
  addListener(
    eventName: 'callAction',
    listenerFunc: (payload: CallActionPayload) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

const CallScreen = registerPlugin<CallScreenPlugin>('CallScreen');
const CALL_ACTION_URL_SCHEME = 'sepchat://call';

let isCallKitInitialized = false;

const normalizeCallAction = (
  value?: string | null
): NativeCallAction | null => {
  if (!value) return null;

  const normalized = value.toLowerCase();
  if (normalized.includes('accept') || normalized.includes('answer')) {
    return 'accept';
  }

  if (
    normalized.includes('decline') ||
    normalized.includes('reject') ||
    normalized.includes('end')
  ) {
    return 'decline';
  }

  return null;
};

const handleNativeAction = async (
  action: NativeCallAction,
  roomId?: string,
  topicId?: string
) => {
  const { handleNativeCallAction } = await import('./useLiveKit');
  await handleNativeCallAction(action, roomId, topicId);
};

const handleCallActionPayload = async (payload?: CallActionPayload | null) => {
  const action = normalizeCallAction(payload?.action);
  if (!action) return;

  await handleNativeAction(action, payload?.roomId, payload?.topicId);
};

const handleAppUrlOpen = async ({ url }: { url: string }) => {
  try {
    const parsedUrl = new URL(url);
    const action =
      normalizeCallAction(parsedUrl.searchParams.get('callAction')) ||
      normalizeCallAction(parsedUrl.pathname.split('/').pop());

    if (!action) return;

    await handleNativeAction(
      action,
      parsedUrl.searchParams.get('roomId') || undefined,
      parsedUrl.searchParams.get('topicId') || undefined
    );
  } catch (error) {
    console.warn('[CallKit] Failed to handle app URL action:', error);
  }
};

export const buildNativeCallActionUrl = (
  action: NativeCallAction,
  roomId?: string,
  topicId?: string
) => {
  const url = new URL(CALL_ACTION_URL_SCHEME);
  url.searchParams.set('callAction', action);

  if (roomId) {
    url.searchParams.set('roomId', roomId);
  }

  if (topicId) {
    url.searchParams.set('topicId', topicId);
  }

  return url.toString();
};

export const initCallKit = async () => {
  if (!Capacitor.isNativePlatform() || isCallKitInitialized) return;

  isCallKitInitialized = true;

  CapacitorApp.addListener('appUrlOpen', event => {
    void handleAppUrlOpen(event);
  });

  window.addEventListener('sep-call-action', event => {
    const customEvent = event as CustomEvent<CallActionPayload>;
    void handleCallActionPayload(customEvent.detail);
  });

  try {
    await CallScreen.addListener('callAction', payload => {
      void handleCallActionPayload(payload);
    });
  } catch (error) {
    console.warn('[CallKit] Native callAction listener is unavailable:', error);
  }

  try {
    const pendingAction = await CallScreen.consumePendingCallAction();
    void handleCallActionPayload(pendingAction);
  } catch (error) {
    console.warn('[CallKit] Failed to consume pending call action:', error);
  }

  try {
    const launchUrl = await CapacitorApp.getLaunchUrl();
    if (launchUrl?.url) {
      void handleAppUrlOpen({ url: launchUrl.url });
    }
  } catch (error) {
    console.warn('[CallKit] Failed to read launch URL:', error);
  }
};

export const showIncomingCallKit = async (
  callerName: string,
  callId: string,
  avatar?: string,
  topicId?: string
) => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await CallScreen.showIncomingCall({
      callerName,
      roomId: callId,
      topicId
    });
  } catch (error) {
    console.warn('[CallKit] Failed to show incoming call:', error, avatar);
  }
};

export const endAllCallKits = async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await CallScreen.dismissIncomingCall({});
  } catch (error) {
    console.warn('[CallKit] Failed to dismiss incoming call:', error);
  }
};
