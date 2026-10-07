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

export interface CallBackgroundOption {
  id: string;
  imageUrl: string;
  mode?: 'none' | 'blur' | 'image';
  label?: string;
  previewSize?: string;
  previewImageUrl?: string;
  previewFilter?: string;
  previewTransform?: string;
  callSize?: string;
  opacity?: number;
  repeat?: string;
  position?: string;
  backgroundColor?: string;
}

interface CallBackgroundPreviewItem {
  id: string;
  previewStyle: CSSProperties;
  label?: string;
  isCustom: boolean;
}

interface StoredCustomCallBackground {
  id: string;
  dataUrl: string;
  createdAt: number;
}

const CALL_BACKGROUND_STORAGE_KEY = 'call_background_selection_v1';
const CALL_BACKGROUND_DB_NAME = 'chat-custom-call-backgrounds-db';
const CALL_BACKGROUND_DB_VERSION = 1;
const CALL_BACKGROUND_STORE_NAME = 'backgrounds';
const CALL_BACKGROUND_NATIVE_STORE = createNativeImageStoreConfig({
  directoryName: 'call-backgrounds',
  metadataKey: 'call_background_custom_images_v1',
  selectionKey: CALL_BACKGROUND_STORAGE_KEY,
  customIdPrefix: 'custom-call-background'
});
const CALL_BACKGROUND_NONE_ID = 'none';
const CALL_BACKGROUND_BLUR_ID = 'blur';
const CALL_BACKGROUND_BLUR_PREVIEW_IMAGE = '/images/chat-wallpapers/blur.webp';

const callBackgroundOptions: CallBackgroundOption[] = [
  {
    id: CALL_BACKGROUND_NONE_ID,
    imageUrl: '',
    mode: 'none',
    label: 'Без фона',
    previewSize: 'cover',
    callSize: 'cover',
    repeat: 'no-repeat',
    backgroundColor:
      'var(--primary-backgroundLight, var(--surface-overlay,#F8F9FD))'
  },
  {
    id: CALL_BACKGROUND_BLUR_ID,
    imageUrl: '',
    mode: 'blur',
    label: 'Размытие',
    previewImageUrl: CALL_BACKGROUND_BLUR_PREVIEW_IMAGE,
    previewSize: 'cover',
    callSize: 'cover',
    repeat: 'no-repeat',
    backgroundColor: '#eff4ff'
  },
  {
    id: 'wallpaper1',
    imageUrl: '/images/chat-wallpapers/wallpaper1-1.svg',
    mode: 'image',
    previewSize: '180px auto',
    callSize: '180px auto',
    backgroundColor: 'var(--surface-main,#f7fbff)'
  },
  {
    id: 'wallpaper2',
    imageUrl: '/images/chat-wallpapers/wallpaper2.svg',
    mode: 'image',
    previewSize: '180px auto',
    callSize: '180px auto',
    backgroundColor: 'var(--surface-main,#f7fbff)'
  },
  {
    id: 'wallpaper3',
    imageUrl: '/images/chat-wallpapers/wallpaper3.svg',
    mode: 'image',
    previewSize: 'cover',
    callSize: '180px auto',
    backgroundColor: 'var(--surface-main,#f7fbff)'
  }
];

const callBackgroundOptionMap = new Map(
  callBackgroundOptions.map(option => [option.id, option])
);

const selectedCallBackgroundId = ref('none');
const customCallBackgrounds = ref<StoredCustomCallBackground[]>([]);
const isInitialized = ref(false);
const isHydratingCustomCallBackgrounds = ref(false);
let callBackgroundAppStateListenerRegistered = false;
const DEFAULT_CALL_BACKGROUND_GRADIENT =
  'linear-gradient(180deg, rgba(251, 253, 255, 1) 0%, rgba(236, 243, 255, 1) 100%)';

const nonePreviewStyle: CSSProperties = {
  background: 'var(--surface-main, #F8F9FD)'
};

const buildCallBackgroundCssVariables = (
  imageUrl: string | null,
  config?: Partial<CallBackgroundOption> & { opacity?: number }
): CSSProperties => ({
  '--call-background-image': imageUrl ? `url("${imageUrl}")` : 'none',
  '--call-background-size': config?.callSize || 'cover',
  '--call-background-repeat': config?.repeat || 'repeat',
  '--call-background-position': config?.position || 'center center',
  '--call-background-opacity': String(config?.opacity ?? 1),
  '--call-background-background': 'var(--surface-main,#f7fbff)',
  '--call-background-fallback': DEFAULT_CALL_BACKGROUND_GRADIENT
});

const buildPreviewStyle = (
  imageUrl: string | null,
  config?: Partial<CallBackgroundOption>
): CSSProperties => ({
  backgroundColor: 'var(--surface-main,#f7fbff)',
  backgroundImage: imageUrl ? `url("${imageUrl}")` : 'none',
  backgroundSize: config?.previewSize || 'cover',
  backgroundRepeat: config?.repeat || 'repeat',
  backgroundPosition: config?.position || 'center',
  filter: config?.previewFilter,
  transform: config?.previewTransform
});

const buildCustomCallBackgroundOption = (
  wallpaper: StoredCustomCallBackground
): CallBackgroundOption => ({
  id: wallpaper.id,
  imageUrl: wallpaper.dataUrl,
  mode: 'image',
  previewSize: 'cover',
  callSize: 'cover',
  repeat: 'no-repeat',
  opacity: 1,
  backgroundColor: 'var(--surface-main,#f7fbff)'
});

const isIndexedDbAvailable = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openCallBackgroundDb = async (): Promise<IDBDatabase> => {
  return await new Promise((resolve, reject) => {
    const request = window.indexedDB.open(
      CALL_BACKGROUND_DB_NAME,
      CALL_BACKGROUND_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(CALL_BACKGROUND_STORE_NAME)) {
        db.createObjectStore(CALL_BACKGROUND_STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const loadStoredCustomCallBackgrounds = async (): Promise<
  StoredCustomCallBackground[]
> => {
  if (!isIndexedDbAvailable()) {
    return [];
  }

  const db = await openCallBackgroundDb();

  return await new Promise((resolve, reject) => {
    const tx = db.transaction(CALL_BACKGROUND_STORE_NAME, 'readonly');
    const store = tx.objectStore(CALL_BACKGROUND_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const results = (request.result || []) as StoredCustomCallBackground[];
      resolve(results.sort((a, b) => b.createdAt - a.createdAt));
    };
    request.onerror = () => reject(request.error);
  });
};

const saveStoredCustomCallBackground = async (
  wallpaper: StoredCustomCallBackground
): Promise<void> => {
  if (!isIndexedDbAvailable()) {
    throw new Error('IndexedDB is not available');
  }

  const db = await openCallBackgroundDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CALL_BACKGROUND_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CALL_BACKGROUND_STORE_NAME);
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

const removeStoredCustomCallBackground = async (id: string): Promise<void> => {
  if (!isIndexedDbAvailable()) {
    return;
  }

  const db = await openCallBackgroundDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CALL_BACKGROUND_STORE_NAME, 'readwrite');
    tx.objectStore(CALL_BACKGROUND_STORE_NAME).delete(id);
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

const persistSelectedCallBackgroundId = (backgroundId: string): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CALL_BACKGROUND_STORAGE_KEY, backgroundId);

  if (isNativeCustomImagePersistenceAvailable()) {
    void persistSelectedId(CALL_BACKGROUND_NATIVE_STORE, backgroundId);
  }
};

const registerCallBackgroundAppStatePersistence = (): void => {
  if (
    callBackgroundAppStateListenerRegistered ||
    !isNativeCustomImagePersistenceAvailable()
  ) {
    return;
  }

  callBackgroundAppStateListenerRegistered = true;

  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) {
      return;
    }

    persistSelectedCallBackgroundId(selectedCallBackgroundId.value);
  });
};

const createCustomCallBackgroundId = (): string => {
  return createPersistentCustomImageId(
    CALL_BACKGROUND_NATIVE_STORE.customIdPrefix
  );
};

const getSelectedCallBackgroundOption = (): CallBackgroundOption | null => {
  const presetBackground = callBackgroundOptionMap.get(
    selectedCallBackgroundId.value
  );

  if (presetBackground) {
    return presetBackground;
  }

  const customBackground = customCallBackgrounds.value.find(
    wallpaper => wallpaper.id === selectedCallBackgroundId.value
  );

  return customBackground
    ? buildCustomCallBackgroundOption(customBackground)
    : null;
};

const getCallBackgroundOptionById = (
  backgroundId: string
): CallBackgroundOption | null => {
  if (!backgroundId) {
    return null;
  }

  const presetBackground = callBackgroundOptionMap.get(backgroundId);

  if (presetBackground) {
    return presetBackground;
  }

  const customBackground = customCallBackgrounds.value.find(
    wallpaper => wallpaper.id === backgroundId
  );

  return customBackground
    ? buildCustomCallBackgroundOption(customBackground)
    : null;
};

const reconcileSelectedCallBackground = (): void => {
  if (selectedCallBackgroundId.value === CALL_BACKGROUND_NONE_ID) {
    return;
  }

  if (callBackgroundOptionMap.has(selectedCallBackgroundId.value)) {
    return;
  }

  const hasSelectedCustomBackground = customCallBackgrounds.value.some(
    wallpaper => wallpaper.id === selectedCallBackgroundId.value
  );

  if (hasSelectedCustomBackground) {
    return;
  }

  selectedCallBackgroundId.value = 'none';
  persistSelectedCallBackgroundId('none');
};

const readBrowserSelectedCallBackgroundId = (): string => {
  if (typeof window === 'undefined') {
    return CALL_BACKGROUND_NONE_ID;
  }

  return (
    window.localStorage.getItem(CALL_BACKGROUND_STORAGE_KEY) ||
    CALL_BACKGROUND_NONE_ID
  );
};

const loadBrowserCustomCallBackgrounds = async (): Promise<
  StoredCustomCallBackground[]
> => {
  return await loadStoredCustomCallBackgrounds();
};

const hydrateCustomCallBackgrounds = async (): Promise<void> => {
  if (isHydratingCustomCallBackgrounds.value || typeof window === 'undefined') {
    return;
  }

  isHydratingCustomCallBackgrounds.value = true;
  callBackgroundHydrationFailed = false;

  try {
    if (isNativeCustomImagePersistenceAvailable()) {
      const browserCustomBackgrounds = await loadBrowserCustomCallBackgrounds();
      let nativeCustomBackgrounds = await loadPersistentCustomImages(
        CALL_BACKGROUND_NATIVE_STORE
      );

      if (browserCustomBackgrounds.length > 0) {
        await migratePersistentCustomImages(
          CALL_BACKGROUND_NATIVE_STORE,
          browserCustomBackgrounds
        );
        nativeCustomBackgrounds = await loadPersistentCustomImages(
          CALL_BACKGROUND_NATIVE_STORE
        );
      }

      customCallBackgrounds.value = nativeCustomBackgrounds;

      const persistedSelectedId =
        (await readPersistedSelectedId(CALL_BACKGROUND_NATIVE_STORE)) || '';
      const browserSelectedId = readBrowserSelectedCallBackgroundId();
      const fallbackSelectedId = persistedSelectedId || browserSelectedId;

      if (
        fallbackSelectedId &&
        fallbackSelectedId !== CALL_BACKGROUND_NONE_ID &&
        !callBackgroundOptionMap.has(fallbackSelectedId)
      ) {
        const selectedNativeBackground = nativeCustomBackgrounds.find(
          wallpaper => wallpaper.id === fallbackSelectedId
        );

        if (selectedNativeBackground) {
          selectedCallBackgroundId.value = selectedNativeBackground.id;
          persistSelectedCallBackgroundId(selectedCallBackgroundId.value);
          reconcileSelectedCallBackground();
          return;
        }

        const selectedBrowserBackground = browserCustomBackgrounds.find(
          wallpaper => wallpaper.id === fallbackSelectedId
        );
        const migratedBackground = selectedBrowserBackground
          ? nativeCustomBackgrounds.find(
              wallpaper =>
                wallpaper.dataUrl === selectedBrowserBackground.dataUrl
            )
          : null;

        selectedCallBackgroundId.value =
          migratedBackground?.id || CALL_BACKGROUND_NONE_ID;
      } else {
        selectedCallBackgroundId.value =
          fallbackSelectedId || CALL_BACKGROUND_NONE_ID;
      }

      persistSelectedCallBackgroundId(selectedCallBackgroundId.value);
      reconcileSelectedCallBackground();
      return;
    }

    customCallBackgrounds.value = await loadStoredCustomCallBackgrounds();
    reconcileSelectedCallBackground();
  } catch (error) {
    callBackgroundHydrationFailed = true;
    console.warn('Failed to hydrate custom call backgrounds:', error);
  } finally {
    isHydratingCustomCallBackgrounds.value = false;
  }
};

let callBackgroundHydration: Promise<void> = Promise.resolve();
let callBackgroundHydrationFailed = false;
const ensureInitialized = (): void => {
  if (isInitialized.value || typeof window === 'undefined') {
    return;
  }

  isInitialized.value = true;

  if (!isNativeCustomImagePersistenceAvailable()) {
    selectedCallBackgroundId.value = readBrowserSelectedCallBackgroundId();
  }

  registerCallBackgroundAppStatePersistence();
  callBackgroundHydration = hydrateCustomCallBackgrounds();
  callBackgroundSync.refresh();
};

const selectCallBackground = (backgroundId: string): void => {
  ensureInitialized();

  if (backgroundId === CALL_BACKGROUND_NONE_ID) {
    selectedCallBackgroundId.value = CALL_BACKGROUND_NONE_ID;
    persistSelectedCallBackgroundId(CALL_BACKGROUND_NONE_ID);
    return;
  }

  if (callBackgroundOptionMap.has(backgroundId)) {
    selectedCallBackgroundId.value = backgroundId;
    persistSelectedCallBackgroundId(backgroundId);
    return;
  }

  const hasCustomBackground = customCallBackgrounds.value.some(
    wallpaper => wallpaper.id === backgroundId
  );

  if (!hasCustomBackground) {
    return;
  }

  selectedCallBackgroundId.value = backgroundId;
  persistSelectedCallBackgroundId(backgroundId);
};

const callBackgroundSync = createCustomBackgroundSync('call', {
  ready: async () => {
    ensureInitialized();
    if (callBackgroundHydrationFailed) {
      callBackgroundHydration = hydrateCustomCallBackgrounds();
    }
    await callBackgroundHydration;
    if (callBackgroundHydrationFailed) {
      throw new Error('Не удалось прочитать сохранённые фоны звонка');
    }
  },
  items: () => customCallBackgrounds.value,
  put: async background => {
    if (isNativeCustomImagePersistenceAvailable()) {
      await savePersistentCustomImageRecord(
        CALL_BACKGROUND_NATIVE_STORE,
        background
      );
    } else {
      await saveStoredCustomCallBackground(background);
    }
    customCallBackgrounds.value = [
      background,
      ...customCallBackgrounds.value.filter(item => item.id !== background.id)
    ].sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  },
  remove: async id => {
    if (isNativeCustomImagePersistenceAvailable()) {
      await removePersistentCustomImage(CALL_BACKGROUND_NATIVE_STORE, id);
    } else {
      await removeStoredCustomCallBackground(id);
    }
    customCallBackgrounds.value = customCallBackgrounds.value.filter(
      background => background.id !== id
    );
  }
});

let pendingCallBackground: StoredCustomCallBackground | null = null;
let pendingCallBackgroundScope: string | null = null;
const setCustomCallBackground = async (dataUrl: string): Promise<void> => {
  ensureInitialized();

  if (!dataUrl) {
    return;
  }

  const scope = callBackgroundSync.scope();
  const background: StoredCustomCallBackground =
    pendingCallBackgroundScope === scope &&
    pendingCallBackground?.dataUrl === dataUrl
      ? pendingCallBackground
      : { id: createCustomCallBackgroundId(), dataUrl, createdAt: Date.now() };

  pendingCallBackground = background;
  pendingCallBackgroundScope = scope;
  await callBackgroundSync.save(background);
  pendingCallBackground = null;
  selectedCallBackgroundId.value = background.id;
  persistSelectedCallBackgroundId(background.id);
};

const deleteCustomCallBackground = async (id: string): Promise<void> => {
  ensureInitialized();

  const wasSelected = selectedCallBackgroundId.value === id;
  await callBackgroundSync.remove(id);

  if (wasSelected) {
    selectedCallBackgroundId.value = CALL_BACKGROUND_NONE_ID;
    persistSelectedCallBackgroundId(CALL_BACKGROUND_NONE_ID);
  }
};

const currentCallBackgroundStyle = computed<CSSProperties>(() => {
  ensureInitialized();

  const backgroundOption = getSelectedCallBackgroundOption();

  if (!backgroundOption || backgroundOption.mode !== 'image') {
    return buildCallBackgroundCssVariables(null, {
      callSize: 'cover',
      repeat: 'no-repeat',
      opacity: 0,
      backgroundColor: 'var(--surface-main,#f7fbff)'
    });
  }

  return buildCallBackgroundCssVariables(
    backgroundOption.imageUrl,
    backgroundOption
  );
});

const isCallBackgroundApplied = computed(() => {
  ensureInitialized();
  return selectedCallBackgroundId.value !== CALL_BACKGROUND_NONE_ID;
});

const callBackgroundPreviewItems = computed<CallBackgroundPreviewItem[]>(() => {
  ensureInitialized();

  const baseItems: CallBackgroundPreviewItem[] = callBackgroundOptions
    .filter(option => option.mode !== 'image')
    .map(option => ({
      id: option.id,
      isCustom: false,
      label: option.label,
      previewStyle:
        option.id === CALL_BACKGROUND_NONE_ID
          ? nonePreviewStyle
          : buildPreviewStyle(option.previewImageUrl || option.imageUrl, option)
    }));

  const customItems: CallBackgroundPreviewItem[] = callBackgroundSync
    .visible()
    .map(wallpaper => ({
      id: wallpaper.id,
      isCustom: true,
      previewStyle: buildPreviewStyle(wallpaper.dataUrl, {
        previewSize: 'cover',
        repeat: 'no-repeat',
        backgroundColor: 'var(--surface-main,#f7fbff)'
      })
    }));

  const presetItems: CallBackgroundPreviewItem[] = callBackgroundOptions
    .filter(option => option.mode === 'image')
    .map(option => ({
      id: option.id,
      isCustom: false,
      previewStyle: buildPreviewStyle(option.imageUrl, option)
    }));

  return [...baseItems, ...customItems, ...presetItems];
});

const selectedCallBackgroundMode = computed<'none' | 'blur' | 'image'>(() => {
  ensureInitialized();

  return getSelectedCallBackgroundOption()?.mode || 'none';
});

export const useCallBackground = () => {
  ensureInitialized();
  callBackgroundSync.refresh();

  return {
    callBackgroundOptions,
    callBackgroundPreviewItems,
    selectedCallBackgroundId: computed(() => selectedCallBackgroundId.value),
    selectedCallBackgroundMode,
    selectedCallBackgroundImageUrl: computed(() =>
      selectedCallBackgroundMode.value === 'image'
        ? getSelectedCallBackgroundOption()?.imageUrl || null
        : null
    ),
    currentCallBackgroundStyle,
    hasCustomCallBackground: computed(
      () => callBackgroundSync.visible().length > 0
    ),
    isCallBackgroundApplied,
    getCallBackgroundOptionById,
    selectCallBackground,
    setCustomCallBackground,
    deleteCustomCallBackground
  };
};
