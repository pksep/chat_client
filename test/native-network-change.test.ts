import { expect, test } from 'bun:test';
import { createNativeNetworkChangeHandler } from '../src/services/native-network-change';

test('смена Wi-Fi при прежнем типе и online запускает одно восстановление', () => {
  let restores = 0;
  const handle = createNativeNetworkChangeHandler({
    onOffline: () => {},
    onRestore: () => restores++
  });
  const wifi = {
    networkConnected: true,
    networkWifi: true,
    networkRevision: 1
  };
  handle(wifi);
  handle({ ...wifi, networkRevision: 2 });
  handle({ ...wifi, networkRevision: 2 });
  expect(restores).toBe(1);
});

test('потеря и возвращение сети восстанавливают чат даже при прежнем счётчике', () => {
  const events: string[] = [];
  const handle = createNativeNetworkChangeHandler({
    onOffline: () => events.push('offline'),
    onRestore: () => events.push('restore')
  });
  handle({ networkConnected: true, networkWifi: true });
  handle({ networkConnected: false });
  handle({ networkConnected: false });
  handle({ networkConnected: true, networkWifi: true });
  expect(events).toEqual(['offline', 'restore']);
});

test('изменения скорости и Android VALIDATED не перезапускают сокет', () => {
  const events: string[] = [];
  const handle = createNativeNetworkChangeHandler({
    onOffline: () => events.push('offline'),
    onRestore: () => events.push('restore')
  });
  handle({
    networkConnected: true,
    networkValidated: false,
    downstreamKbps: 100
  });
  handle({
    networkConnected: true,
    networkValidated: true,
    downstreamKbps: 3000
  });
  expect(events).toEqual([]);
  handle({ networkConnected: true, networkValidated: true, networkVpn: true });
  expect(events).toEqual(['restore']);
});

test('блокировка сети для приложения и её снятие учитываются при доступном интернете', () => {
  const events: string[] = [];
  const handle = createNativeNetworkChangeHandler({
    onOffline: () => events.push('offline'),
    onRestore: () => events.push('restore')
  });
  const network = {
    networkConnected: true,
    networkValidated: true,
    networkWifi: true,
    networkRevision: 7
  };
  handle({ ...network, networkBlocked: false });
  handle({ ...network, networkBlocked: true });
  handle({
    ...network,
    networkBlocked: true,
    networkRestrictBackgroundStatus: 3
  });
  handle({ ...network, networkBlocked: false });
  handle({ ...network, networkBlocked: false });
  expect(events).toEqual(['offline', 'restore']);
});
