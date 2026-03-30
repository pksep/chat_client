import { ref, nextTick } from 'vue';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner';
import { showErrorNotification } from './useNotifications';

export interface IQrAuthResult {
  token: string;
  organization?: string;
}

export const useQrAuth = () => {
  const isScanning = ref(false);

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

      try {
        const url = new URL(result.ScanResult);
        const token = url.searchParams.get('token')?.split('?token')[0] || '';

        if (!token) {
          showErrorNotification('Не удалось получить токен');
          return null;
        }

        return {
          token,
          organization: url.searchParams.get('organization') || ''
        };
      } catch {
        return {
          token: result.ScanResult
        };
      }
    } catch (error) {
      console.error('Ошибка сканирования:', error);
      showErrorNotification('Не удалось открыть камеру');
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
