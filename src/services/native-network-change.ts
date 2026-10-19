import type { NativeNetworkStatus } from './useTelemetryDevice';

const isAvailableToApp = (status: NativeNetworkStatus): boolean =>
  status.networkConnected && status.networkBlocked !== true;

const fingerprint = (status: NativeNetworkStatus): string =>
  JSON.stringify([
    status.networkRevision,
    status.networkWifi,
    status.networkCellular,
    status.networkEthernet,
    status.networkVpn
  ]);

export const createNativeNetworkChangeHandler = (options: {
  onOffline: () => void;
  onRestore: () => void;
}) => {
  let previous: NativeNetworkStatus | null = null;

  return (status: NativeNetworkStatus): void => {
    const before = previous;
    previous = { ...status };
    if (!isAvailableToApp(status)) {
      if (!before || isAvailableToApp(before)) options.onOffline();
      return;
    }

    // VALIDATED проверяет интернет Android, а не доступность сервера чата.
    if (
      before &&
      (!isAvailableToApp(before) || fingerprint(before) !== fingerprint(status))
    ) {
      options.onRestore();
    }
  };
};
