import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface NativePushNotificationPayload {
  id?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
}

export interface NativePushPermissionState {
  receive: 'granted' | 'prompt' | 'denied';
}

export interface RustorePushPlugin {
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
  clearNotificationsForTopic(options: { topicId: string }): Promise<void>;
  clearAllNotifications(): Promise<void>;
}

export const RustorePush = registerPlugin<RustorePushPlugin>('RustorePush');
