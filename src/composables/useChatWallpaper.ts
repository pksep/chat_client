import { App } from '@capacitor/app';
import { computed, ref, type CSSProperties } from 'vue';
import {
  createNativeImageStoreConfig,
  createPersistentCustomImageId,
  isNativeCustomImagePersistenceAvailable,
  loadPersistentCustomImages,
  migratePersistentCustomImages,
  persistSelectedId,
  readPersistedSelectedId,
  removePersistentCustomImage,
  savePersistentCustomImageRecord
} from '../services/customImagePersistence';
import { createCustomBackgroundSync } from '../services/useCustomBackgroundSync';

export interface ChatWallpaperOption {
  id: string;
  imageUrl: string;
  previewSize?: string;
  chatSize?: string;
  opacity?: number;
  repeat?: string;
  position?: string;
  backgroundColor?: string;
}

interface ChatWallpaperPreviewItem {
  id: string;
  previewStyle: CSSProperties;
  isCustom: boolean;
}

interface StoredCustomWallpaper {
  id: string;
  dataUrl: string;
  createdAt: number;
}

const CHAT_WALLPAPER_STORAGE_KEY = 'chat_wallpaper_selection_v2';
const LEGACY_CHAT_WALLPAPER_STORAGE_KEY = 'chat_wallpaper_selection_v1';
const LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY =
  'chat_wallpaper_custom_data_v1';
const WALLPAPER_DB_NAME = 'chat-custom-wallpapers-db';
const WALLPAPER_DB_VERSION = 1;
const WALLPAPER_STORE_NAME = 'wallpapers';
const WALLPAPER_NATIVE_STORE = createNativeImageStoreConfig({
  directoryName: 'chat-wallpapers',
  metadataKey: 'chat_wallpaper_custom_images_v1',
  selectionKey: CHAT_WALLPAPER_STORAGE_KEY,
  customIdPrefix: 'custom-wallpaper'
});

const wallpaperOptions: ChatWallpaperOption[] = [
  {
    id: 'wallpaper1',
    imageUrl: '/images/chat-wallpapers/wallpaper1-1.svg',
    previewSize: '180px auto',
    chatSize: '180px auto',
    backgroundColor: 'var(--surface-main,#f7fbff)'
  },
  {
    id: 'wallpaper2',
    imageUrl: '/images/chat-wallpapers/wallpaper2.svg',
    previewSize: '180px auto',
    chatSize: '180px auto',
    backgroundColor: 'var(--surface-main,#f7fbff)'
  },
  {
    id: 'wallpaper3',
    imageUrl: '/images/chat-wallpapers/wallpaper3.svg',
    previewSize: 'cover',
    chatSize: '180px auto',
    backgroundColor: 'var(--surface-main,#f7fbff)'
  }
];

const wallpaperOptionMap = new Map(
  wallpaperOptions.map(option => [option.id, option])
);

const selectedWallpaperId = ref('none');
const customWallpapers = ref<StoredCustomWallpaper[]>([]);
const isInitialized = ref(false);
const isHydratingCustomWallpapers = ref(false);
let wallpaperAppStateListenerRegistered = false;
let wallpaperHydration: Promise<void> = Promise.resolve();
let wallpaperHydrationFailed = false;
const DEFAULT_WALLPAPER_GRADIENT =
  'var(--chat-wallpaper-none-background, linear-gradient(180deg, rgba(251, 253, 255, 1) 0%, rgba(236, 243, 255, 1) 100%))';

const nonePreviewStyle: CSSProperties = {
  background: DEFAULT_WALLPAPER_GRADIENT
};

const buildWallpaperCssVariables = (
  imageUrl: string | null,
  config?: Partial<ChatWallpaperOption> & { opacity?: number }
): CSSProperties => ({
  '--chat-wallpaper-image': imageUrl ? `url("${imageUrl}")` : 'none',
  '--chat-wallpaper-size': config?.chatSize || 'cover',
  '--chat-wallpaper-repeat': config?.repeat || 'repeat',
  '--chat-wallpaper-position': config?.position || 'center top',
  '--chat-wallpaper-opacity': String(config?.opacity ?? 1),
  '--chat-wallpaper-background': 'var(--surface-main)'
});

const buildPreviewStyle = (
  imageUrl: string | null,
  config?: Partial<ChatWallpaperOption>
): CSSProperties => ({
  backgroundColor: 'var(--surface-main,#f7fbff)',
  backgroundImage: imageUrl ? `url("${imageUrl}")` : 'none',
  backgroundSize: config?.previewSize || 'cover',
  backgroundRepeat: config?.repeat || 'repeat',
  backgroundPosition: config?.position || 'center'
});

const buildCustomWallpaperOption = (
  wallpaper: StoredCustomWallpaper
): ChatWallpaperOption => ({
  id: wallpaper.id,
  imageUrl: wallpaper.dataUrl,
  previewSize: 'cover',
  chatSize: 'cover',
  repeat: 'no-repeat',
  opacity: 1,
  backgroundColor: 'var(--surface-main,#f7fbff)'
});

const isIndexedDbAvailable = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openWallpaperDb = async (): Promise<IDBDatabase> => {
  return await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      WALLPAPER_DB_NAME,
      WALLPAPER_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(WALLPAPER_STORE_NAME)) {
        db.createObjectStore(WALLPAPER_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const loadStoredCustomWallpapers = async (): Promise<
  StoredCustomWallpaper[]
> => {
  if (!isIndexedDbAvailable()) {
    return [];
  }

  const db = await openWallpaperDb();

  return await new Promise((resolve, reject) => {
    const tx = db.transaction(WALLPAPER_STORE_NAME, 'readonly');
    const store = tx.objectStore(WALLPAPER_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = (request.result || []) as StoredCustomWallpaper[];
      resolve(results.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
};

const saveStoredCustomWallpaper = async (
  wallpaper: StoredCustomWallpaper
): Promise<void> => {
  if (!isIndexedDbAvailable()) {
    throw new Error('IndexedDB is not available');
  }

  const db = await openWallpaperDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WALLPAPER_STORE_NAME, 'readwrite');
    const store = tx.objectStore(WALLPAPER_STORE_NAME);
    store.put(wallpaper);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Не удалось сохранить фон'));
    };
  });
};

const removeStoredCustomWallpaper = async (id: string): Promise<void> => {
  if (!isIndexedDbAvailable()) {
    return;
  }

  const db = await openWallpaperDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(WALLPAPER_STORE_NAME, 'readwrite');
    tx.objectStore(WALLPAPER_STORE_NAME).delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error || new Error('Не удалось удалить фон'));
    };
  });
};

const persistSelectedWallpaperId = (wallpaperId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CHAT_WALLPAPER_STORAGE_KEY, wallpaperId);

  if (isNativeCustomImagePersistenceAvailable()) {
    void persistSelectedId(WALLPAPER_NATIVE_STORE, wallpaperId);
  }
};

const cacheStartupCustomWallpaper = (dataUrl: string): void => {
  if (typeof window === 'undefined' || !dataUrl) {
    return;
  }

  try {
    window.localStorage.setItem(
      LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY,
      dataUrl
    );
  } catch (error) {
    console.warn('Failed to cache custom wallpaper for startup:', error);
  }
};

const cacheSelectedCustomWallpaperForStartup = (): void => {
  const selectedCustomWallpaper = customWallpapers.value.find(
    wallpaper => wallpaper.id === selectedWallpaperId.value
  );

  if (selectedCustomWallpaper) {
    cacheStartupCustomWallpaper(selectedCustomWallpaper.dataUrl);
  }
};

const registerWallpaperAppStatePersistence = (): void => {
  if (
    wallpaperAppStateListenerRegistered ||
    !isNativeCustomImagePersistenceAvailable()
  ) {
    return;
  }

  wallpaperAppStateListenerRegistered = true;

  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      return;
    }

    persistSelectedWallpaperId(selectedWallpaperId.value);
  });
};

const createCustomWallpaperId = (): string => {
  return createPersistentCustomImageId(WALLPAPER_NATIVE_STORE.customIdPrefix);
};

const getSelectedWallpaperOption = (): ChatWallpaperOption | null => {
  if (selectedWallpaperId.value === 'none') {
    return null;
  }

  const presetWallpaper = wallpaperOptionMap.get(selectedWallpaperId.value);

  if (presetWallpaper) {
    return presetWallpaper;
  }

  const customWallpaper = customWallpapers.value.find(
    wallpaper => wallpaper.id === selectedWallpaperId.value
  );

  return customWallpaper ? buildCustomWallpaperOption(customWallpaper) : null;
};

const reconcileSelectedWallpaper = (): void => {
  if (selectedWallpaperId.value === 'none') {
    return;
  }

  if (wallpaperOptionMap.has(selectedWallpaperId.value)) {
    return;
  }

  const hasSelectedCustomWallpaper = customWallpapers.value.some(
    wallpaper => wallpaper.id === selectedWallpaperId.value
  );

  if (hasSelectedCustomWallpaper) {
    return;
  }

  selectedWallpaperId.value = 'none';
  persistSelectedWallpaperId('none');
};

const readBrowserSelectedWallpaperId = (): string => {
  if (typeof window === 'undefined') {
    return 'none';
  }

  return (
    window.localStorage.getItem(CHAT_WALLPAPER_STORAGE_KEY) ||
    window.localStorage.getItem(LEGACY_CHAT_WALLPAPER_STORAGE_KEY) ||
    'none'
  );
};

const hydrateStartupWallpaperFromSynchronousCache = (): void => {
  const browserSelectedId = readBrowserSelectedWallpaperId();

  selectedWallpaperId.value = browserSelectedId;

  if (
    browserSelectedId === 'none' ||
    wallpaperOptionMap.has(browserSelectedId) ||
    typeof window === 'undefined'
  ) {
    return;
  }

  const cachedDataUrl =
    window.localStorage.getItem(LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY) || '';

  if (!cachedDataUrl) {
    return;
  }

  // Native persistence is intentionally hydrated in the background. Keep a
  // synchronous copy of the selected image so the first topic paint already
  // has the same wallpaper and never flashes the plain surface first.
  customWallpapers.value = [
    {
      id: browserSelectedId,
      dataUrl: cachedDataUrl,
      createdAt: 0
    }
  ];
};

const loadBrowserCustomWallpapers = async (): Promise<
  StoredCustomWallpaper[]
> => {
  const wallpapers = await loadStoredCustomWallpapers();

  if (typeof window === 'undefined') {
    return wallpapers;
  }

  const legacyDataUrl =
    window.localStorage.getItem(LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY) || '';

  if (
    legacyDataUrl &&
    !wallpapers.some(wallpaper => wallpaper.dataUrl === legacyDataUrl)
  ) {
    wallpapers.unshift({
      id: createCustomWallpaperId(),
      dataUrl: legacyDataUrl,
      createdAt: Date.now()
    });
  }

  return wallpapers.sort((a, b) => b.createdAt - a.createdAt);
};

const migrateLegacyCustomWallpaper = async (): Promise<void> => {
  if (typeof window === 'undefined') {
    return;
  }

  const legacyDataUrl =
    window.localStorage.getItem(LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY) || '';

  if (!legacyDataUrl) {
    return;
  }

  const hasSameWallpaper = customWallpapers.value.some(
    wallpaper => wallpaper.dataUrl === legacyDataUrl
  );

  if (!hasSameWallpaper) {
    const migratedWallpaper: StoredCustomWallpaper = {
      id: createCustomWallpaperId(),
      dataUrl: legacyDataUrl,
      createdAt: Date.now()
    };

    try {
      await saveStoredCustomWallpaper(migratedWallpaper);
      customWallpapers.value = [migratedWallpaper, ...customWallpapers.value];
    } catch (error) {
      console.warn('Failed to migrate legacy custom wallpaper:', error);
      return;
    }
  }

  const legacySelectedWallpaper =
    window.localStorage.getItem(LEGACY_CHAT_WALLPAPER_STORAGE_KEY) || '';

  if (legacySelectedWallpaper === 'custom' && customWallpapers.value[0]) {
    selectedWallpaperId.value = customWallpapers.value[0].id;
    persistSelectedWallpaperId(selectedWallpaperId.value);
  }
};

const hydrateCustomWallpapers = async (): Promise<void> => {
  if (isHydratingCustomWallpapers.value || typeof window === 'undefined') {
    return;
  }

  isHydratingCustomWallpapers.value = true;
  wallpaperHydrationFailed = false;

  try {
    if (isNativeCustomImagePersistenceAvailable()) {
      const browserCustomWallpapers = await loadBrowserCustomWallpapers();
      let nativeCustomWallpapers = await loadPersistentCustomImages(
        WALLPAPER_NATIVE_STORE
      );

      if (browserCustomWallpapers.length > 0) {
        await migratePersistentCustomImages(
          WALLPAPER_NATIVE_STORE,
          browserCustomWallpapers
        );
        nativeCustomWallpapers = await loadPersistentCustomImages(
          WALLPAPER_NATIVE_STORE
        );
      }

      customWallpapers.value = nativeCustomWallpapers;

      const persistedSelectedId =
        (await readPersistedSelectedId(WALLPAPER_NATIVE_STORE)) || '';
      const browserSelectedId = readBrowserSelectedWallpaperId();
      const fallbackSelectedId = persistedSelectedId || browserSelectedId;

      if (
        fallbackSelectedId &&
        fallbackSelectedId !== 'none' &&
        !wallpaperOptionMap.has(fallbackSelectedId)
      ) {
        const selectedNativeWallpaper = nativeCustomWallpapers.find(
          wallpaper => wallpaper.id === fallbackSelectedId
        );

        if (selectedNativeWallpaper) {
          selectedWallpaperId.value = selectedNativeWallpaper.id;
          persistSelectedWallpaperId(selectedWallpaperId.value);
          reconcileSelectedWallpaper();
          cacheSelectedCustomWallpaperForStartup();
          return;
        }

        const selectedBrowserWallpaper = browserCustomWallpapers.find(
          wallpaper => wallpaper.id === fallbackSelectedId
        );
        const migratedWallpaper = selectedBrowserWallpaper
          ? nativeCustomWallpapers.find(
              wallpaper =>
                wallpaper.dataUrl === selectedBrowserWallpaper.dataUrl
            )
          : null;

        selectedWallpaperId.value = migratedWallpaper?.id || 'none';
      } else {
        selectedWallpaperId.value = fallbackSelectedId || 'none';
      }

      persistSelectedWallpaperId(selectedWallpaperId.value);
      reconcileSelectedWallpaper();
      cacheSelectedCustomWallpaperForStartup();
      return;
    }

    customWallpapers.value = await loadStoredCustomWallpapers();
    await migrateLegacyCustomWallpaper();
    reconcileSelectedWallpaper();
    cacheSelectedCustomWallpaperForStartup();
  } catch (error) {
    wallpaperHydrationFailed = true;
    console.warn('Failed to hydrate custom wallpapers:', error);
  } finally {
    isHydratingCustomWallpapers.value = false;
  }
};

const ensureInitialized = (): void => {
  if (isInitialized.value || typeof window === 'undefined') {
    return;
  }

  isInitialized.value = true;
  hydrateStartupWallpaperFromSynchronousCache();

  registerWallpaperAppStatePersistence();
  wallpaperHydration = hydrateCustomWallpapers();
  wallpaperSync.refresh();
};

const selectWallpaper = (wallpaperId: string): void => {
  ensureInitialized();

  if (wallpaperId === 'none') {
    selectedWallpaperId.value = 'none';
    persistSelectedWallpaperId('none');
    return;
  }

  if (wallpaperOptionMap.has(wallpaperId)) {
    selectedWallpaperId.value = wallpaperId;
    persistSelectedWallpaperId(wallpaperId);
    return;
  }

  const customWallpaper = customWallpapers.value.find(
    wallpaper => wallpaper.id === wallpaperId
  );

  if (!customWallpaper) {
    return;
  }

  selectedWallpaperId.value = wallpaperId;
  cacheStartupCustomWallpaper(customWallpaper.dataUrl);
  persistSelectedWallpaperId(wallpaperId);
};

const wallpaperSync = createCustomBackgroundSync('chat', {
  ready: async () => {
    ensureInitialized();
    if (wallpaperHydrationFailed) {
      wallpaperHydration = hydrateCustomWallpapers();
    }
    await wallpaperHydration;
    if (wallpaperHydrationFailed) {
      throw new Error('Не удалось прочитать сохранённые фоны чата');
    }
  },
  items: () => customWallpapers.value,
  put: async wallpaper => {
    if (isNativeCustomImagePersistenceAvailable()) {
      await savePersistentCustomImageRecord(WALLPAPER_NATIVE_STORE, wallpaper);
    } else {
      await saveStoredCustomWallpaper(wallpaper);
    }
    customWallpapers.value = [
      wallpaper,
      ...customWallpapers.value.filter(item => item.id !== wallpaper.id)
    ].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  },
  remove: async id => {
    if (isNativeCustomImagePersistenceAvailable()) {
      await removePersistentCustomImage(WALLPAPER_NATIVE_STORE, id);
    } else {
      await removeStoredCustomWallpaper(id);
    }
    customWallpapers.value = customWallpapers.value.filter(
      wallpaper => wallpaper.id !== id
    );
  }
});

let pendingWallpaper: StoredCustomWallpaper | null = null;
let pendingWallpaperScope: string | null = null;
const setCustomWallpaper = async (dataUrl: string): Promise<void> => {
  ensureInitialized();

  if (!dataUrl) {
    return;
  }

  const scope = wallpaperSync.scope();
  const wallpaper: StoredCustomWallpaper =
    pendingWallpaperScope === scope && pendingWallpaper?.dataUrl === dataUrl
      ? pendingWallpaper
      : { id: createCustomWallpaperId(), dataUrl, createdAt: Date.now() };

  pendingWallpaper = wallpaper;
  pendingWallpaperScope = scope;
  await wallpaperSync.save(wallpaper);
  pendingWallpaper = null;
  selectedWallpaperId.value = wallpaper.id;
  cacheStartupCustomWallpaper(wallpaper.dataUrl);
  persistSelectedWallpaperId(wallpaper.id);
};

const deleteCustomWallpaper = async (id: string): Promise<void> => {
  ensureInitialized();

  const wasSelected = selectedWallpaperId.value === id;
  await wallpaperSync.remove(id);

  if (!wasSelected) {
    return;
  }

  selectedWallpaperId.value = 'none';
  persistSelectedWallpaperId('none');

  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY);
  }
};

const currentWallpaperStyle = computed<CSSProperties>(() => {
  ensureInitialized();

  const wallpaperOption = getSelectedWallpaperOption();

  if (!wallpaperOption) {
    return {
      background: DEFAULT_WALLPAPER_GRADIENT,
      ...buildWallpaperCssVariables(null, {
        chatSize: 'cover',
        repeat: 'no-repeat',
        opacity: 0,
        backgroundColor: 'var(--surface-main,#f7fbff)'
      })
    };
  }

  return buildWallpaperCssVariables(wallpaperOption.imageUrl, wallpaperOption);
});

const isWallpaperApplied = computed(() => {
  ensureInitialized();
  return selectedWallpaperId.value !== 'none';
});

const wallpaperPreviewItems = computed<ChatWallpaperPreviewItem[]>(() => {
  ensureInitialized();

  const items: ChatWallpaperPreviewItem[] = wallpaperSync
    .visible()
    .map(wallpaper => ({
      id: wallpaper.id,
      isCustom: true,
      previewStyle: buildPreviewStyle(wallpaper.dataUrl, {
        previewSize: 'cover',
        repeat: 'no-repeat',
        backgroundColor: 'transparent'
      })
    }));

  items.push({
    id: 'none',
    isCustom: false,
    previewStyle: nonePreviewStyle
  });

  wallpaperOptions.forEach(option => {
    items.push({
      id: option.id,
      isCustom: false,
      previewStyle: buildPreviewStyle(option.imageUrl, option)
    });
  });

  return items;
});

export const useChatWallpaper = () => {
  ensureInitialized();
  wallpaperSync.refresh();

  return {
    wallpaperOptions,
    wallpaperPreviewItems,
    selectedWallpaperId: computed(() => selectedWallpaperId.value),
    currentWallpaperStyle,
    hasCustomWallpaper: computed(() => wallpaperSync.visible().length > 0),
    isWallpaperApplied,
    selectWallpaper,
    setCustomWallpaper,
    deleteCustomWallpaper
  };
};
