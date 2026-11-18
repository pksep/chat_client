import { beforeEach, describe, expect, mock, test } from 'bun:test';

let native = true;
let trayFails = false;
let badgeFails = false;
let windows = false;
let tray: null | {
  setIcon: () => Promise<void>;
  setTooltip: () => Promise<void>;
} = null;
let badgeCalls: (number | undefined)[] = [];
let overlayCalls: unknown[] = [];
let trayCalls = 0;
let nextCount = 1;

mock.module('../src/services/useTauriNotifications', () => ({
  isTauriRuntime: () => native
}));
mock.module('@tauri-apps/api/tray', () => ({
  TrayIcon: {
    getById: async () => {
      trayCalls++;
      if (trayFails) throw new Error('Тест: трей недоступен');
      return tray;
    }
  }
}));
mock.module('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    setBadgeCount: async (count?: number) => {
      badgeCalls.push(count);
      if (badgeFails) throw new Error('Тест: Dock недоступен');
    },
    setOverlayIcon: async (icon: unknown) => {
      overlayCalls.push(icon);
      if (badgeFails) throw new Error('Тест: панель задач недоступна');
    }
  })
}));

const implementations = [
  [
    'общая',
    (await import('../src/services/useTauriTrayBadge')).syncTauriTrayBadge
  ],
  [
    'desktop',
    (await import('../src/services/useTauriTrayBadge.desktop'))
      .syncTauriTrayBadge
  ]
] as const;

beforeEach(() => {
  native = true;
  trayFails = false;
  badgeFails = false;
  windows = false;
  tray = null;
  badgeCalls = [];
  overlayCalls = [];
  trayCalls = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      get userAgent() {
        return windows ? 'Windows' : 'Macintosh';
      }
    }
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ getContext: () => null }) }
  });
});

for (const [name, sync] of implementations) {
  describe(`Счётчик Tauri: ${name}`, () => {
    test('Dock обновляется при отказе поиска трея', async () => {
      trayFails = true;
      const count = nextCount++;
      await sync({ count, mutedOnly: false });
      expect(badgeCalls).toEqual([count]);
    });

    test('ошибка canvas трея не блокирует Dock', async () => {
      tray = { setIcon: async () => {}, setTooltip: async () => {} };
      const count = nextCount++;
      await sync({ count, mutedOnly: false });
      expect(badgeCalls).toEqual([count]);
    });

    test('обнуление Dock проходит при отказе трея', async () => {
      trayFails = true;
      await sync({ count: 0, mutedOnly: false, force: true });
      expect(badgeCalls).toHaveLength(1);
      expect(badgeCalls).toEqual([undefined]);
    });

    test('сбой Dock допускает повтор с тем же числом без force', async () => {
      badgeFails = true;
      const count = nextCount++;
      await sync({ count, mutedOnly: false });
      badgeFails = false;
      await sync({ count, mutedOnly: false });
      expect(badgeCalls).toEqual([count, count]);
      await sync({ count, mutedOnly: false });
      expect(badgeCalls).toHaveLength(2);
    });

    test('Windows очищает overlay при отказе трея', async () => {
      windows = true;
      trayFails = true;
      await sync({ count: 0, mutedOnly: false, force: true });
      expect(overlayCalls).toHaveLength(1);
      expect(overlayCalls).toEqual([undefined]);
      expect(badgeCalls).toEqual([]);
    });

    test('сбой overlay допускает повтор без force', async () => {
      windows = true;
      badgeFails = true;
      await sync({ count: 0, mutedOnly: true });
      badgeFails = false;
      await sync({ count: 0, mutedOnly: true });
      expect(overlayCalls).toHaveLength(2);
      expect(overlayCalls).toEqual([undefined, undefined]);
    });

    test('успешное состояние не отправляется повторно без force', async () => {
      const count = nextCount++;
      await sync({ count, mutedOnly: true });
      await sync({ count, mutedOnly: true });
      expect(badgeCalls).toEqual([count]);
      expect(trayCalls).toBe(1);
    });
  });
}

test('веб не обращается к нативному Dock и трею', async () => {
  native = false;
  await implementations[0][1]({ count: nextCount++, mutedOnly: false });
  expect(trayCalls).toBe(0);
  expect(badgeCalls).toEqual([]);
});
