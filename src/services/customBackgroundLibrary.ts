export type CustomBackgroundKind = 'chat' | 'call';

export interface CustomBackgroundImage {
  id: string;
  dataUrl: string;
  createdAt: number;
}

export interface CustomBackgroundMetadata {
  id: string;
  kind: CustomBackgroundKind;
  createdAt: number;
}

export interface CustomBackgroundApi {
  getCustomBackgrounds(
    kind: CustomBackgroundKind
  ): Promise<CustomBackgroundMetadata[]>;
  getCustomBackground(
    kind: CustomBackgroundKind,
    id: string
  ): Promise<CustomBackgroundImage>;
  saveCustomBackground(
    kind: CustomBackgroundKind,
    image: CustomBackgroundImage
  ): Promise<CustomBackgroundMetadata>;
}

export interface BackgroundLibraryCache {
  ready(): Promise<void>;
  items(): CustomBackgroundImage[];
  put(image: CustomBackgroundImage): Promise<void>;
  getOwner(id: string): Promise<string | null>;
  setOwner(id: string, scope: string): Promise<void>;
  isMigrated(scope: string): Promise<boolean>;
  markMigrated(scope: string): Promise<void>;
}

// Синхронизируется библиотека, но не выбор фона на устройстве.
export class CustomBackgroundLibrary {
  private session: { scope: string; api: CustomBackgroundApi } | null = null;
  private owners = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();
  private refreshing: Promise<void> | null = null;
  private refreshedAt = 0;

  constructor(
    private kind: CustomBackgroundKind,
    private cache: BackgroundLibraryCache,
    private changed: () => void = () => {}
  ) {}

  configure(scope: string | null, api?: CustomBackgroundApi) {
    this.session = scope && api ? { scope, api } : null;
    this.refreshing = null;
    this.refreshedAt = 0;
    this.changed();
  }

  visible(items: CustomBackgroundImage[]) {
    return items.filter(item =>
      this.session
        ? this.owners.get(item.id) === this.session.scope
        : !this.owners.has(item.id)
    );
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }

  private async claim(id: string, scope: string) {
    let owner = this.owners.get(id) || (await this.cache.getOwner(id));
    if (!owner) {
      await this.cache.setOwner(id, scope);
      owner = scope;
    }
    this.owners.set(id, owner);
    this.changed();
    return owner === scope;
  }

  refresh(maxAgeMs = 0): Promise<void> {
    if (this.refreshing) return this.refreshing;
    if (maxAgeMs > 0 && Date.now() - this.refreshedAt < maxAgeMs)
      return Promise.resolve();
    const session = this.session;
    if (!session) return Promise.resolve();
    const operation = this.enqueue(async () => {
      await this.cache.ready();
      if (this.session !== session) return;
      const local = this.cache.items().slice();
      for (const image of local) {
        if (this.session !== session) return;
        await this.claim(image.id, session.scope);
      }
      if (this.session !== session) return;
      const remote = await session.api.getCustomBackgrounds(this.kind);
      if (this.session !== session) return;
      const remoteIds = new Set(remote.map(image => image.id));
      const localIds = new Set(local.map(image => image.id));
      let firstError: unknown;
      // Старые локальные изображения переносятся с прежними ID: активный фон не меняется.
      if (!(await this.cache.isMigrated(session.scope))) {
        for (const image of local) {
          if (this.session !== session) return;
          if (
            this.owners.get(image.id) !== session.scope ||
            remoteIds.has(image.id)
          )
            continue;
          try {
            await session.api.saveCustomBackground(this.kind, image);
          } catch (error) {
            firstError ??= error;
          }
        }
        if (this.session !== session) return;
        if (!firstError) await this.cache.markMigrated(session.scope);
      }
      for (const metadata of remote) {
        if (this.session !== session) return;
        if (
          localIds.has(metadata.id) &&
          this.owners.get(metadata.id) === session.scope
        )
          continue;
        try {
          const image = await session.api.getCustomBackground(
            this.kind,
            metadata.id
          );
          if (this.session !== session) return;
          if (!(await this.claim(image.id, session.scope))) continue;
          if (this.session !== session) return;
          await this.cache.put(image);
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError) throw firstError;
      if (this.session === session) this.refreshedAt = Date.now();
    });
    this.refreshing = operation;
    void operation
      .finally(() => {
        if (this.refreshing === operation) this.refreshing = null;
      })
      .catch(() => {});
    return operation;
  }

  save(image: CustomBackgroundImage): Promise<void> {
    const session = this.session;
    return this.enqueue(async () => {
      if (!session || this.session !== session)
        throw new Error('Для сохранения фона нужно войти в аккаунт');
      await this.cache.ready();
      if (this.session !== session)
        throw new Error('Аккаунт изменился. Повторите загрузку фона');
      if (!(await this.claim(image.id, session.scope)))
        throw new Error('Этот фон принадлежит другому аккаунту');
      if (this.session !== session)
        throw new Error('Аккаунт изменился. Повторите загрузку фона');
      await session.api.saveCustomBackground(this.kind, image);
      if (this.session !== session)
        throw new Error('Аккаунт изменился. Повторите загрузку фона');
      await this.cache.put(image);
      if (this.session !== session)
        throw new Error('Аккаунт изменился. Повторите загрузку фона');
    });
  }
}
