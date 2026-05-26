import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';

interface StoredNativeCustomImageMeta {
  id: string;
  fileName: string;
  createdAt: number;
}

export interface StoredPersistentCustomImage {
  id: string;
  dataUrl: string;
  createdAt: number;
}

type NativeImageStoreConfig = {
  directoryName: string;
  metadataKey: string;
  selectionKey: string;
  customIdPrefix: string;
};

const isNativePlatform = () => Capacitor.isNativePlatform();

const buildFilePath = (directoryName: string, fileName: string) =>
  `${directoryName}/${fileName}`;

const safeParseJson = <T>(value: string | null, fallback: T): T => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn('Failed to parse persisted JSON value:', error);
    return fallback;
  }
};

export const isNativeCustomImagePersistenceAvailable = (): boolean =>
  isNativePlatform();

export const createPersistentCustomImageId = (prefix: string): string => {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${randomPart}`;
};

export const readPersistedSelectedId = async (
  selectionKey: string
): Promise<string | null> => {
  if (!isNativePlatform()) {
    return null;
  }

  const { value } = await Preferences.get({ key: selectionKey });
  return value || null;
};

export const persistSelectedId = async (
  selectionKey: string,
  selectedId: string
): Promise<void> => {
  if (!isNativePlatform()) {
    return;
  }

  await Preferences.set({
    key: selectionKey,
    value: selectedId
  });
};

const readNativeImageMetadata = async (
  config: NativeImageStoreConfig
): Promise<StoredNativeCustomImageMeta[]> => {
  const { value } = await Preferences.get({ key: config.metadataKey });
  const items = safeParseJson<StoredNativeCustomImageMeta[]>(value, []);

  return items
    .filter(item => !!item?.id && !!item?.fileName)
    .sort((a, b) => b.createdAt - a.createdAt);
};

const writeNativeImageMetadata = async (
  config: NativeImageStoreConfig,
  items: StoredNativeCustomImageMeta[]
): Promise<void> => {
  await Preferences.set({
    key: config.metadataKey,
    value: JSON.stringify(items)
  });
};

export const loadPersistentCustomImages = async (
  config: NativeImageStoreConfig
): Promise<StoredPersistentCustomImage[]> => {
  if (!isNativePlatform()) {
    return [];
  }

  const items = await readNativeImageMetadata(config);
  const results = await Promise.all(
    items.map(async item => {
      try {
        const file = await Filesystem.readFile({
          path: buildFilePath(config.directoryName, item.fileName),
          directory: Directory.Data,
          encoding: Encoding.UTF8
        });

        return {
          id: item.id,
          dataUrl: String(file.data),
          createdAt: item.createdAt
        } satisfies StoredPersistentCustomImage;
      } catch (error) {
        console.warn('Failed to load persisted custom image:', error);
        return null;
      }
    })
  );

  return results.filter(
    (item): item is StoredPersistentCustomImage => item !== null
  );
};

export const savePersistentCustomImage = async (
  config: NativeImageStoreConfig,
  dataUrl: string
): Promise<StoredPersistentCustomImage> => {
  const item: StoredPersistentCustomImage = {
    id: createPersistentCustomImageId(config.customIdPrefix),
    dataUrl,
    createdAt: Date.now()
  };

  return await savePersistentCustomImageRecord(config, item);
};

const savePersistentCustomImageRecord = async (
  config: NativeImageStoreConfig,
  item: StoredPersistentCustomImage
): Promise<StoredPersistentCustomImage> => {
  const fileName = `${item.id}.txt`;

  await Filesystem.mkdir({
    path: config.directoryName,
    directory: Directory.Data,
    recursive: true
  }).catch(() => {});

  await Filesystem.writeFile({
    path: buildFilePath(config.directoryName, fileName),
    directory: Directory.Data,
    data: item.dataUrl,
    encoding: Encoding.UTF8,
    recursive: true
  });

  const nextItem: StoredNativeCustomImageMeta = {
    id: item.id,
    fileName,
    createdAt: item.createdAt
  };
  const existingItems = await readNativeImageMetadata(config);
  const filteredExistingItems = existingItems.filter(
    existingItem => existingItem.id !== nextItem.id
  );
  await writeNativeImageMetadata(config, [nextItem, ...filteredExistingItems]);

  return {
    id: item.id,
    dataUrl: item.dataUrl,
    createdAt: item.createdAt
  };
};

export const migratePersistentCustomImages = async (
  config: NativeImageStoreConfig,
  items: StoredPersistentCustomImage[]
): Promise<StoredPersistentCustomImage[]> => {
  if (!isNativePlatform() || !items.length) {
    return [];
  }

  const migratedItems: StoredPersistentCustomImage[] = [];
  const existingItems = await readNativeImageMetadata(config);
  const existingByDataUrl = new Map<string, StoredNativeCustomImageMeta>();

  for (const item of existingItems) {
    try {
      const file = await Filesystem.readFile({
        path: buildFilePath(config.directoryName, item.fileName),
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
      existingByDataUrl.set(String(file.data), item);
    } catch (error) {
      console.warn(
        'Failed to inspect persisted custom image during migration:',
        error
      );
    }
  }

  for (const item of items.sort((a, b) => b.createdAt - a.createdAt)) {
    const existingItem = existingByDataUrl.get(item.dataUrl);

    if (existingItem) {
      migratedItems.push({
        id: existingItem.id,
        dataUrl: item.dataUrl,
        createdAt: existingItem.createdAt
      });
      continue;
    }

    const savedItem = await savePersistentCustomImageRecord(config, item);
    migratedItems.push(savedItem);
  }

  return migratedItems.sort((a, b) => b.createdAt - a.createdAt);
};

export const createNativeImageStoreConfig = (
  config: NativeImageStoreConfig
): NativeImageStoreConfig => config;
