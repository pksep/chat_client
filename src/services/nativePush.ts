import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativePushNotificationPayload {
  id?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

export interface NativePushPermissionState {
  receive: 'granted' | 'prompt' | 'prompt-with-rationale' | 'denied';
}

export interface RuStorePushPlugin {
  addListener(
    eventName: 'registration',
    listenerFunc: (token: { value: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'registrationError',
    listenerFunc: (error: { error: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'pushNotificationReceived',
    listenerFunc: (notification: NativePushNotificationPayload) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'pushNotificationDeleted',
    listenerFunc: () => void
  ): Promise<PluginListenerHandle>;
  checkPermissions(): Promise<NativePushPermissionState>;
  requestPermissions(): Promise<NativePushPermissionState>;
  register(): Promise<{ value?: string }>;
  unregister(): Promise<void>;
  clearNotificationsForTopic(options: {
    topicId: string;
    stateAt?: number;
  }): Promise<void>;
  clearNotificationForMessage(options: {
    topicId: string;
    messageId: string;
  }): Promise<void>;
  clearAllNotifications(): Promise<void>;
  removeAllListeners(): Promise<void>;
}

export const RuStorePush = registerPlugin<RuStorePushPlugin>('RuStorePush');
