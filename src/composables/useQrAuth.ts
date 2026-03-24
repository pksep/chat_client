import { ref, nextTick } from 'vue';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerAndroidScanningLibrary,
  CapacitorBarcodeScannerTypeHint
} from '@capacitor/barcode-scanner';

export interface IQrAuthResult {
  token: string;
  organization?: string;
}

export const useQrAuth = () => {
  const scanError = ref('');
  const isError = ref(false);
  const isScanning = ref(false);
  const notificationKey = ref(0);

  const scanQrCode = async (): Promise<IQrAuthResult | null> => {
    isError.value = false;
    scanError.value = '';

    await nextTick();
    notificationKey.value += 1;

    if (!Capacitor.isNativePlatform() && !window.isSecureContext) {
      scanError.value = 'Соединение не защищено (HTTP). Камера недоступна.';
      isError.value = true;
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
        scanError.value = 'Сканирование отменено';
        isError.value = true;
        return null;
      }

      try {
        const url = new URL(result.ScanResult);
        const token = url.searchParams.get('token')?.split('?token')[0] || '';

        if (!token) {
          scanError.value = 'Не удалось получить токен';
          isError.value = true;
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
      scanError.value = 'Не удалось открыть камеру';
      isError.value = true;
      return null;
    } finally {
      isScanning.value = false;
    }
  };

  return {
    isError,
    isScanning,
    notificationKey,
    scanError,
    scanQrCode
  };
};
