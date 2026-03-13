import {
  FlutterCallkitIncoming,
  CallKitParams
} from 'capacitor-incoming-call-kit';
import { Capacitor } from '@capacitor/core';
import { confirmAnswer, rejectCall } from './useJitsi';

export const initCallKit = async () => {
  if (!Capacitor.isNativePlatform()) return;

  // Listeners for native UI actions
  FlutterCallkitIncoming.addListener(
    'com.hiennv.flutter_callkit_incoming.ACTION_CALL_ACCEPT',
    (data: any) => {
      console.log('[CallKit] Accepted:', data);
      confirmAnswer();
    }
  );

  FlutterCallkitIncoming.addListener(
    'com.hiennv.flutter_callkit_incoming.ACTION_CALL_DECLINE',
    (data: any) => {
      console.log('[CallKit] Declined:', data);
      rejectCall();
    }
  );
};

export const showIncomingCallKit = async (
  callerName: string,
  callId: string,
  avatar?: string
) => {
  if (!Capacitor.isNativePlatform()) return;

  const params: CallKitParams = {
    id: callId,
    nameCaller: callerName,
    appName: 'SEP Chat',
    avatar: avatar || '',
    handle: callerName,
    type: 0,
    android: {
      isCustomNotification: true,
      isShowFullLockedScreen: true,
      backgroundColor: '#0955fa',
      actionColor: '#4CAF50',
      incomingCallNotificationChannelName: 'Incoming Call',
      missedCallNotificationChannelName: 'Missed Call'
    },
    ios: {
      iconName: 'AppIcon',
      handleType: 'generic',
      supportsVideo: true,
      maximumCallGroups: 1,
      maximumCallsPerCallGroup: 1
    }
  };

  try {
    await FlutterCallkitIncoming.onMethod({
      methodName: 'showCallkitIncoming',
      parsedOptions: params,
      options: JSON.stringify(params)
    });
  } catch (error) {
    console.error('[CallKit] Error:', error);
  }
};

export const endAllCallKits = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await FlutterCallkitIncoming.onMethod({
      methodName: 'endAllCalls',
      parsedOptions: {},
      options: ''
    });
  } catch (e) {
    console.error('[CallKit] Error:', e);
  }
};
