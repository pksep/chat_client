import { ref, nextTick } from 'vue';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner';
import { showErrorNotification } from './useNotifications';
import { parseQrAuthPayload, resolveQrAuthPayload } from '../utils/qr-auth';
import type { IQrAuth, IQrAuthResult } from '../types/qr-auth';

export type { IQrAuthResult } from '../types/qr-auth';

/** Подключает нативный или браузерный сканер к общему разбору QR авторизации. */
export const useQrAuth = (): IQrAuth => {
  const isScanning = ref(false);

  /** Считывает данные без журналирования токена или одноразового кода. */
  const scanQrCode = async (): Promise<IQrAuthResult | null> => {
    await nextTick();

    if (!Capacitor.isNativePlatform() && !window.isSecureContext) {
      showErrorNotification(
        'Соединение не защищено (HTTP). Камера недоступна.'
      );
      return null;
    }

    try {
      isScanning.value = true;

      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.ALL,
        android: {
          scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT
        },
        scanInstructions: 'Наведите камеру на QR-код'
      });

      if (!result.ScanResult) {
        showErrorNotification('Сканирование отменено');
        return null;
      }

      const payload = parseQrAuthPayload(result.ScanResult);

      if (!payload) {
        showErrorNotification('Не удалось прочитать QR-код входа');

        return null;
      }

      return await resolveQrAuthPayload(payload);
    } catch {
      // Нативные исключения могут отражать содержимое QR: не журналируем их.
      showErrorNotification(
        'Не удалось войти по QR-коду. Отсканируйте новый QR.'
      );
      return null;
    } finally {
      isScanning.value = false;
    }
  };

  return {
    isScanning,
    scanQrCode
  };
};
