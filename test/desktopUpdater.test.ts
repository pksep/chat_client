import { describe, expect, test } from 'bun:test';
import {
  createDesktopUpdater,
  type DesktopUpdateResource
} from '../src/services/desktop-updater';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
function fixture() {
  const calls = {
    check: 0,
    download: 0,
    install: 0,
    save: 0,
    relaunch: 0,
    close: 0
  };
  let resource: DesktopUpdateResource | null = {
    version: '1.6.1',
    body: 'Исправления',
    download: async onEvent => {
      calls.download++;
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 50 } });
      expect(updater.state.value.progress).toBe(50);
      onEvent({ event: 'Finished' });
      expect(updater.state.value.phase).toBe('downloading');
    },
    install: async () => {
      calls.install++;
    },
    close: async () => {
      calls.close++;
    }
  };
  let blocked = '';
  let checkError = false;
  let afterSave: () => void = () => undefined;
  const updater = createDesktopUpdater({
    check: async () => {
      calls.check++;
      if (checkError) throw new Error('network');
      return resource;
    },
    blockingReason: () => blocked,
    prepareToInstall: async () => {
      calls.save++;
      afterSave();
    },
    relaunch: async () => {
      calls.relaunch++;
    }
  });
  return {
    updater,
    calls,
    get resource() {
      return resource!;
    },
    latest: () => {
      resource = null;
    },
    block: (reason: string) => {
      blocked = reason;
    },
    failCheck: (value: boolean) => {
      checkError = value;
    },
    afterSave: (callback: () => void) => {
      afterSave = callback;
    }
  };
}

describe('Обновления desktop', () => {
  test('проверка версии и отсутствие обновлений', async () => {
    const f = fixture();
    f.latest();
    await f.updater.check();
    expect(f.updater.state.value.phase).toBe('latest');
  });
  test('проверка сама скачивает пакет; один клик сохраняет черновики и устанавливает', async () => {
    const f = fixture();
    await f.updater.check();
    expect(f.updater.state.value).toMatchObject({
      phase: 'downloaded',
      version: '1.6.1'
    });
    expect(f.calls).toMatchObject({
      download: 1,
      save: 0,
      install: 0,
      relaunch: 0
    });
    await f.updater.act();
    expect(f.calls).toMatchObject({
      check: 1,
      download: 1,
      save: 1,
      install: 1,
      relaunch: 1
    });
  });
  test('сетевой сбой не отображается как актуальная версия; повтор работает', async () => {
    const f = fixture();
    f.failCheck(true);
    await f.updater.check();
    expect(f.updater.state.value.phase).toBe('error');
    f.failCheck(false);
    await f.updater.check();
    expect(f.updater.state.value.phase).toBe('downloaded');
  });
  test('повторная проверка сохраняет готовый пакет без нового запроса', async () => {
    const f = fixture();
    await f.updater.check();
    f.latest();
    await f.updater.check();
    expect(f.updater.state.value).toMatchObject({
      phase: 'downloaded',
      version: '1.6.1'
    });
    expect(f.calls.close).toBe(0);
    expect(f.calls.check).toBe(1);
    expect(f.updater.state.value.phase).toBe('downloaded');
    expect(f.calls.download).toBe(1);
  });
  test('после сбоя загрузки пустой ответ не выдаётся за актуальную версию', async () => {
    const f = fixture();
    f.resource.download = async () => {
      throw new Error('network');
    };
    await f.updater.act();
    f.latest();
    await f.updater.check();
    expect(f.updater.state.value).toMatchObject({
      phase: 'error',
      version: '1.6.1'
    });
    expect(f.updater.state.value.error).toContain('временно недоступно');
    expect(f.calls.install).toBe(0);
  });
  test('фоновые проверки восстанавливаются после ошибки найденного обновления', async () => {
    const f = fixture();
    const download = f.resource.download;
    f.resource.download = async () => {
      throw new Error('offline');
    };
    await f.updater.check();
    f.failCheck(true);
    await f.updater.check();
    expect(f.updater.state.value).toMatchObject({
      phase: 'error',
      version: '1.6.1'
    });
    f.failCheck(false);
    f.resource.download = download;
    await f.updater.check();
    expect(f.updater.state.value.phase).toBe('downloaded');
    expect(f.calls.check).toBe(3);
    expect(f.calls.install).toBe(0);
  });
  test('повреждённая подпись освобождает пакет и запрещает установку', async () => {
    const f = fixture();
    f.resource.download = async () => {
      throw new Error('invalid signature');
    };
    await f.updater.act();
    expect(f.updater.state.value.phase).toBe('error');
    expect(f.calls.close).toBe(1);
    expect(f.calls.install).toBe(0);
  });
  test('звонок или передача блокируют установку; скачанный пакет сохраняется', async () => {
    const f = fixture();
    await f.updater.act();
    f.block('Завершите звонок');
    await f.updater.act();
    expect(f.updater.state.value.error).toBe('Завершите звонок');
    expect(f.calls.install).toBe(0);
    f.block('');
    await f.updater.act();
    expect(f.calls.install).toBe(1);
    expect(f.calls.download).toBe(1);
  });
  test('звонок начался при сохранении черновика — установка отложена', async () => {
    const f = fixture();
    await f.updater.act();
    f.afterSave(() => f.block('Завершите звонок'));
    await f.updater.act();
    expect(f.updater.state.value.phase).toBe('downloaded');
    expect(f.calls.install).toBe(0);
  });
  test('ошибка сохранения черновика не завершает приложение', async () => {
    const f = fixture();
    await f.updater.act();
    f.afterSave(() => {
      throw new Error('quota');
    });
    await f.updater.act();
    expect(f.updater.state.value.phase).toBe('downloaded');
    expect(f.calls.relaunch).toBe(0);
  });
  test('повторные клики не дублируют скачивание; проверка не удаляет готовый пакет', async () => {
    const f = fixture();
    const gate = deferred();
    let downloads = 0;
    f.resource.download = async () => {
      downloads++;
      await gate.promise;
    };
    const first = f.updater.check();
    await Promise.resolve();
    await Promise.resolve();
    const second = f.updater.act();
    const third = f.updater.check();
    gate.resolve();
    await Promise.all([first, second, third]);
    await f.updater.check();
    expect(downloads).toBe(1);
    expect(f.calls.check).toBe(1);
    expect(f.updater.state.value.phase).toBe('downloaded');
    expect(f.calls.install).toBe(0);
    expect(f.calls.relaunch).toBe(0);
  });
  test('Finished до проверки подписи не разрешает установку даже после раннего клика', async () => {
    const f = fixture();
    const gate = deferred();
    const started = deferred();
    f.resource.download = async onEvent => {
      onEvent({ event: 'Finished' });
      started.resolve();
      await gate.promise;
      throw new Error('invalid signature');
    };
    const background = f.updater.check();
    await started.promise;
    expect(f.updater.state.value.phase).toBe('downloading');
    const earlyClick = f.updater.act();
    gate.resolve();
    await Promise.all([background, earlyClick]);
    expect(f.updater.state.value.phase).toBe('error');
    expect(f.calls).toMatchObject({
      install: 0,
      save: 0,
      relaunch: 0,
      close: 1
    });
  });
  test('двойной клик готового обновления не дублирует установку и перезапуск', async () => {
    const f = fixture();
    await f.updater.check();
    const gate = deferred();
    f.resource.install = async () => {
      f.calls.install++;
      await gate.promise;
    };
    const first = f.updater.act();
    const second = f.updater.act();
    const check = f.updater.check();
    gate.resolve();
    await Promise.all([first, second, check]);
    expect(f.calls).toMatchObject({
      check: 1,
      download: 1,
      save: 1,
      install: 1,
      relaunch: 1
    });
  });
  test('ошибка установщика допускает повтор', async () => {
    const f = fixture();
    const install = f.resource.install;
    f.resource.install = async () => {
      throw new Error('installer');
    };
    await f.updater.act();
    await f.updater.act();
    expect(f.updater.state.value.phase).toBe('downloaded');
    f.resource.install = install;
    await f.updater.act();
    expect(f.calls.relaunch).toBe(1);
  });
  test('ошибка перезапуска после установки не запускает установку повторно', async () => {
    let installs = 0;
    let restarts = 0;
    const updater = createDesktopUpdater({
      check: async () => ({
        version: '1.6.1',
        download: async () => undefined,
        install: async () => {
          installs++;
        },
        close: async () => undefined
      }),
      blockingReason: () => '',
      prepareToInstall: async () => undefined,
      relaunch: async () => {
        if (++restarts === 1) throw new Error('restart');
      }
    });
    await updater.act();
    await updater.act();
    await updater.act();
    expect(installs).toBe(1);
    expect(restarts).toBe(2);
  });
});
