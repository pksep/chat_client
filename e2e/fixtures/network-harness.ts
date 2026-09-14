import { createApp, h } from 'vue';
import { useMobileApp } from '../../src/composables/useMobileApp';
import { getChatSDK } from '../../src/services/useChat';
export * as users from '../../src/composables/useUsers';
export * as topics from '../../src/composables/useTopics';
export { initializeChat } from '../../src/services/useChat';
export { filterVisibleUsers } from '../../src/utils/user-directory';
export { fetchAllTopics } from '../../src/composables/useTopics';
export { getWebChatBackgroundSyncSnapshot } from '../../src/services/useWebChatBackgroundSync';

export const mountUpdates = () => {
  const host = document.createElement('div');
  document.body.append(host);
  let updates!: ReturnType<typeof useMobileApp>;
  const app = createApp({
    setup() {
      updates = useMobileApp();
      return () => h('div');
    }
  });
  app.mount(host);
  return { app, updates };
};

export const controlConnection = () => {
  const sdk = getChatSDK() as any;
  let connected = true;
  const calls = { connect: 0, disconnect: 0, reconnect: 0 };
  sdk.isConnected = () => connected;
  sdk.sendWebSocketEvent = () => {};
  sdk.disconnect = () => {
    calls.disconnect++;
    connected = false;
    sdk.emitConnectionState(false);
  };
  sdk.connect = async () => {
    calls.connect++;
    connected = true;
    sdk.emitConnectionState(true);
  };
  sdk.reconnectIfNeeded = () => {
    calls.reconnect++;
    connected = true;
  };
  sdk.emitConnectionState(true);
  return {
    calls,
    loseConnection() {
      connected = false;
      sdk.emitConnectionState(false);
    }
  };
};
