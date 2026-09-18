import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CustomBackgroundLibrary,
  type CustomBackgroundApi,
  type CustomBackgroundImage,
  type CustomBackgroundKind
} from '../src/services/customBackgroundLibrary';

const image = (id: string): CustomBackgroundImage => ({
  id,
  dataUrl: `data:image/png;base64,${id}`,
  createdAt: 123
});

const server = () => {
  const records = new Map<string, CustomBackgroundImage>();
  const uploads: string[] = [];
  const api: CustomBackgroundApi = {
    getCustomBackgrounds: async kind =>
      [...records.entries()]
        .filter(([key]) => key.startsWith(`${kind}:`))
        .map(([, item]) => ({ id: item.id, kind, createdAt: item.createdAt })),
    getCustomBackground: async (kind, id) => records.get(`${kind}:${id}`)!,
    saveCustomBackground: async (kind, item) => {
      uploads.push(item.id);
      records.set(`${kind}:${item.id}`, item);
      return { id: item.id, kind, createdAt: item.createdAt };
    },
    deleteCustomBackground: async (kind, id) => {
      records.delete(`${kind}:${id}`);
    }
  };
  return { api, uploads, records };
};

const device = (
  api: CustomBackgroundApi,
  initial: CustomBackgroundImage[] = [],
  kind: CustomBackgroundKind = 'chat'
) => {
  const cached = new Map(initial.map(item => [item.id, item]));
  const owners = new Map<string, string>();
  const migrated = new Set<string>();
  let active = initial[0]?.id || 'none';
  const cache = {
    ready: async () => {},
    items: () => [...cached.values()],
    put: async (item: CustomBackgroundImage) => {
      cached.set(item.id, item);
    },
    remove: async (id: string) => {
      cached.delete(id);
      owners.delete(id);
    },
    getOwner: async (id: string) => owners.get(id) || null,
    setOwner: async (id: string, scope: string) => {
      owners.set(id, scope);
    },
    isMigrated: async (scope: string) => migrated.has(scope),
    markMigrated: async (scope: string) => {
      migrated.add(scope);
    }
  };
  const library = new CustomBackgroundLibrary(kind, cache);
  library.configure('server:user-a', api);
  return {
    library,
    cache,
    cached,
    owners,
    migrated,
    active: () => active,
    select: (id: string) => {
      active = id;
    }
  };
};

describe('серверная библиотека фонов', () => {
  it('ошибка чтения локального кэша не завершает одноразовый перенос', async () => {
    const remote = server();
    const first = device(remote.api, [image('old')]);
    first.cache.ready = async () => {
      throw new Error('storage unavailable');
    };
    await assert.rejects(first.library.refresh());
    assert.equal(first.migrated.size, 0);
    assert.equal(remote.uploads.length, 0);
    first.cache.ready = async () => {};
    await first.library.refresh();
    assert.deepEqual(remote.uploads, ['old']);
  });

  it('смена аккаунта во время записи владельца отменяет отправку', async () => {
    const remote = server();
    const first = device(remote.api);
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    let started!: () => void;
    const writing = new Promise<void>(resolve => {
      started = resolve;
    });
    first.cache.setOwner = async () => {
      started();
      await pending;
    };
    const saving = first.library.save(image('private'));
    const rejected = assert.rejects(saving, /Аккаунт изменился/);
    await writing;
    first.library.configure('server:user-b', server().api);
    release();
    await rejected;
    assert.equal(remote.uploads.length, 0);
  });

  for (const kind of ['chat', 'call'] as const) {
    it(`${kind}: объединяет старые фоны двух устройств и не меняет локальный выбор`, async () => {
      const remote = server();
      const first = device(remote.api, [image('old-a')], kind);
      const second = device(remote.api, [image('old-b')], kind);
      await Promise.all([first.library.refresh(), second.library.refresh()]);
      await Promise.all([first.library.refresh(), second.library.refresh()]);
      assert.deepEqual([...first.cached.keys()].sort(), ['old-a', 'old-b']);
      assert.deepEqual([...second.cached.keys()].sort(), ['old-a', 'old-b']);
      assert.equal(first.active(), 'old-a');
      assert.equal(second.active(), 'old-b');
      assert.deepEqual(remote.uploads.sort(), ['old-a', 'old-b']);
    });
  }

  it('пустое устройство получает список, но не выбирает фон', async () => {
    const remote = server();
    await remote.api.saveCustomBackground('chat', image('remote'));
    const fresh = device(remote.api);
    await fresh.library.refresh();
    assert.ok(fresh.cached.has('remote'));
    assert.equal(fresh.active(), 'none');
  });

  it('отметка одноразового переноса переживает перезапуск', async () => {
    const remote = server();
    const first = device(remote.api, [image('old')]);
    await first.library.refresh();
    remote.records.clear();
    const restarted = new CustomBackgroundLibrary('chat', first.cache);
    restarted.configure('server:user-a', remote.api);
    await restarted.refresh();
    assert.deepEqual(remote.uploads, ['old']);
    assert.equal(remote.records.size, 0);
  });

  it('повторяет незавершённый перенос, не дублируя успешные элементы', async () => {
    const remote = server();
    const save = remote.api.saveCustomBackground;
    let failed = false;
    remote.api.saveCustomBackground = async (kind, item) => {
      if (item.id === 'retry' && !failed) {
        failed = true;
        throw new Error('offline');
      }
      return save(kind, item);
    };
    const first = device(remote.api, [image('ok'), image('retry')]);
    await assert.rejects(first.library.refresh());
    assert.equal(first.migrated.size, 0);
    await first.library.refresh();
    assert.deepEqual(remote.uploads, ['ok', 'retry']);
    assert.equal(first.migrated.size, 1);
  });

  it('новый фон появляется локально только после подтверждения сервера', async () => {
    const remote = server();
    const first = device(remote.api);
    await first.library.refresh();
    const save = remote.api.saveCustomBackground;
    remote.api.saveCustomBackground = async () => {
      throw new Error('offline');
    };
    await assert.rejects(first.library.save(image('new')));
    assert.equal(first.cached.size, 0);
    assert.equal(first.active(), 'none');
    remote.api.saveCustomBackground = save;
    await first.library.save(image('new'));
    assert.ok(first.cached.has('new'));
    assert.ok(remote.records.has('chat:new'));
  });

  it('не отправляет фоны первого аккаунта во второй', async () => {
    const remoteA = server();
    const remoteB = server();
    const first = device(remoteA.api, [image('private-a')]);
    await first.library.refresh();
    first.library.configure('server:user-b', remoteB.api);
    await first.library.refresh();
    assert.equal(remoteB.records.size, 0);
    assert.deepEqual(first.library.visible(first.cache.items()), []);
    assert.equal(first.active(), 'private-a');
  });

  it('не применяет запоздавший ответ после смены аккаунта', async () => {
    const remote = server();
    await remote.api.saveCustomBackground('chat', image('private'));
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    let started!: () => void;
    const downloading = new Promise<void>(resolve => {
      started = resolve;
    });
    const get = remote.api.getCustomBackground;
    remote.api.getCustomBackground = async (kind, id) => {
      started();
      await pending;
      return get(kind, id);
    };
    const first = device(remote.api);
    const refresh = first.library.refresh();
    await downloading;
    first.library.configure('server:user-b', server().api);
    release();
    await refresh;
    assert.equal(first.cached.size, 0);
  });

  it('параллельные обновления списка выполняют один запрос', async () => {
    const remote = server();
    const first = device(remote.api, [image('old')]);
    await Promise.all([
      first.library.refresh(),
      first.library.refresh(),
      first.library.refresh()
    ]);
    assert.deepEqual(remote.uploads, ['old']);
  });
});
