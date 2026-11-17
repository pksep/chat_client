import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isTauri } from '@tauri-apps/api/core';
import { MessageTypeEnum } from '@pksep/yui';
import { showNotification } from '../composables/useNotifications';
import { parseGroupCallInviteUrl } from '../utils/groupCallInviteUrl';
import { createGroupCallInviteQueue } from './groupCallInviteQueue';
import { invitedGroupCall } from './useCallState';

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
const groupCallInviteQueue = createGroupCallInviteQueue();

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

export const handleAppUrlOpen = async ({ url }: { url: string }) => {
  try {
    const invite = parseGroupCallInviteUrl(url, {
      allowTrustedNativeOrigin: Capacitor.isNativePlatform() || isTauri()
    });

    if (invite) {
      groupCallInviteQueue.enqueue({
        key: `${invite.roomId}\u0000${invite.inviteToken}`,
        url
      });
      await flushPendingGroupCallInviteUrl();
      return;
    }

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

export const flushPendingGroupCallInviteUrl = async (): Promise<boolean> => {
  try {
    const { getChatSDK } = await import('./useChat');

    return await groupCallInviteQueue.flush(
      () => getChatSDK()?.isConnected() === true,
      async url => {
        const invite = parseGroupCallInviteUrl(url, {
          allowTrustedNativeOrigin: Capacitor.isNativePlatform() || isTauri()
        });
        const sdk = getChatSDK();

        if (!invite || !sdk) {
          return false;
        }

        // Start the small invite request before loading LiveKit. Expired links
        // avoid downloading LiveKit and media processors at all.
        const preview = await sdk.getGroupCallInvitePreview(
          invite.roomId,
          invite.inviteToken
        );

        if (!preview) {
          invitedGroupCall.value = null;
          showNotification({
            title: 'Ссылка недействительна',
            description: 'Ссылка на звонок больше не действует.',
            type: MessageTypeEnum.error
          });
          return true;
        }

        const { openGroupCallInviteUrl } = await import('./useLiveKit');
        return openGroupCallInviteUrl(url, { preview });
      }
    );
  } catch (error) {
    console.warn('[CallKit] Failed to open group call invite:', error);
    return false;
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

  // Read the launch URL before initializing the optional native call screen.
  // This keeps a cold App Link independent from that plugin's startup time.
  try {
    const launchUrl = await CapacitorApp.getLaunchUrl();
    if (launchUrl?.url) {
      void handleAppUrlOpen({ url: launchUrl.url });
    }
  } catch (error) {
    console.warn('[CallKit] Failed to read launch URL:', error);
  }

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

export const dismissIncomingCallKit = async (roomId?: string | null) => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    await CallScreen.dismissIncomingCall(roomId ? { roomId } : {});
  } catch (error) {
    console.warn('[CallKit] Failed to dismiss incoming call:', error);
  }
};

export const endAllCallKits = () => dismissIncomingCallKit();
