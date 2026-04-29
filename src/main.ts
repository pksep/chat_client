import { createApp } from 'vue';
import App from './App.vue';
import '@fontsource-variable/inter';
import './assets/globals.css';
import './assets/chat-container.css';
import '@pksep/yui/styles';

const INDEXED_DB_RESET_EPOCH = 'chat-client-indexeddb-reset-2026-04-29-v1';
const INDEXED_DB_RESET_DONE_KEY = 'chat.indexeddb.reset.done';
const INDEXED_DB_NAMES = [
  'chat-sync-shadow-db',
  'chat-topic-messages-db',
  'chat-offline-state-db',
  'chat-media-blob-cache-db',
  'chat-messages-db'
];

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const deleteIndexedDb = async (dbName: string): Promise<boolean> => {
  if (!hasIndexedDb()) {
    return true;
  }

  return new Promise(resolve => {
    const request = window.indexedDB.deleteDatabase(dbName);

    request.onsuccess = () => resolve(true);
    request.onerror = () => {
      console.warn(`Failed to delete IndexedDB database: ${dbName}`);
      resolve(false);
    };
    request.onblocked = () => {
      console.warn(`IndexedDB delete was blocked for database: ${dbName}`);
      resolve(false);
    };
  });
};

const runIndexedDbResetIfNeeded = async (): Promise<void> => {
  if (
    typeof window === 'undefined' ||
    !hasIndexedDb() ||
    !window.localStorage
  ) {
    return;
  }

  if (
    window.localStorage.getItem(INDEXED_DB_RESET_DONE_KEY) ===
    INDEXED_DB_RESET_EPOCH
  ) {
    return;
  }

  let allDeleted = true;

  for (const dbName of INDEXED_DB_NAMES) {
    const deleted = await deleteIndexedDb(dbName);

    if (!deleted) {
      allDeleted = false;
    }
  }

  if (allDeleted) {
    window.localStorage.setItem(
      INDEXED_DB_RESET_DONE_KEY,
      INDEXED_DB_RESET_EPOCH
    );
  }
};

const mountApp = async () => {
  await runIndexedDbResetIfNeeded();

  const app = createApp(App);

  app.directive('on-click-outside', {
    beforeMount(el, binding) {
      const handler = (event: Event) => {
        const target = event.target as Node | null;

        if (!target || el === target || el.contains(target)) {
          return;
        }

        if (typeof binding.value === 'function') {
          binding.value(event);
        }
      };

      (el as HTMLElement & { __clickOutside__?: typeof handler }).__clickOutside__ =
        handler;

      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    },
    unmounted(el) {
      const handler = (
        el as HTMLElement & { __clickOutside__?: (event: Event) => void }
      ).__clickOutside__;

      if (!handler) {
        return;
      }

      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      delete (
        el as HTMLElement & { __clickOutside__?: (event: Event) => void }
      ).__clickOutside__;
    }
  });

  app.mount('#app');
};

void mountApp();
