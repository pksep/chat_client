import { ref } from 'vue';
import { Preferences } from '@capacitor/preferences';
import { App } from '@capacitor/app';
import {
  CustomBackgroundLibrary,
  type BackgroundLibraryCache,
  type CustomBackgroundApi,
  type CustomBackgroundKind
} from './customBackgroundLibrary';

const libraries = new Set<CustomBackgroundLibrary>();
const revision = ref(0);
let session: { scope: string; api: CustomBackgroundApi } | null = null;
let listenersRegistered = false;

export const refreshCustomBackgrounds = () => {
  for (const library of libraries) {
    void library.refresh().catch(error => {
      console.warn('Не удалось синхронизировать список фонов:', error);
    });
  }
};

export const configureCustomBackgroundSync = (
  scope: string | null,
  api?: CustomBackgroundApi
) => {
  session = scope && api ? { scope, api } : null;
  for (const library of libraries)
    library.configure(session?.scope || null, session?.api);
  refreshCustomBackgrounds();
  if (!listenersRegistered && typeof window !== 'undefined') {
    listenersRegistered = true;
    window.addEventListener('online', refreshCustomBackgrounds);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshCustomBackgrounds();
    });
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) refreshCustomBackgrounds();
    }).catch(() => {});
  }
};

export const createCustomBackgroundSync = (
  kind: CustomBackgroundKind,
  cache: Pick<BackgroundLibraryCache, 'ready' | 'items' | 'put'>
) => {
  const ownerKey = (id: string) => `custom_background_owner_v1:${kind}:${id}`;
  const migrationKey = (scope: string) =>
    `custom_background_migrated_v1:${kind}:${scope}`;
  const library = new CustomBackgroundLibrary(
    kind,
    {
      ...cache,
      getOwner: async id =>
        (await Preferences.get({ key: ownerKey(id) })).value,
      setOwner: async (id, scope) =>
        Preferences.set({ key: ownerKey(id), value: scope }),
      isMigrated: async scope =>
        (await Preferences.get({ key: migrationKey(scope) })).value === '1',
      markMigrated: async scope =>
        Preferences.set({ key: migrationKey(scope), value: '1' })
    },
    () => {
      revision.value++;
    }
  );
  libraries.add(library);
  if (session) library.configure(session.scope, session.api);
  return {
    scope: () => session?.scope || null,
    save: (image: Parameters<CustomBackgroundLibrary['save']>[0]) =>
      library.save(image),
    refresh: () => {
      void library
        .refresh()
        .catch(error =>
          console.warn('Не удалось синхронизировать список фонов:', error)
        );
    },
    visible: () => {
      void revision.value;
      return library.visible(cache.items());
    }
  };
};
