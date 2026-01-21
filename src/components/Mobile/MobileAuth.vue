<template>
  <div class="mobile-auth-container">
    <div
      class="qr-content"
      style="
        position: fixed;
        width: 100dvw;
        height: 100dvh;
        object-fit: contain;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      "
    >
      <h2>Мобильный вход</h2>

      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.large"
        @click="scanQrCode"
        :loading="isScanning"
      >
        Авторизоваться по QR
      </Button>

      <p v-if="scanError" style="color: red; text-align: center; padding: 10px">
        {{ scanError }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';
import { 
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
  CapacitorBarcodeScannerAndroidScanningLibrary
} from '@capacitor/barcode-scanner';

const emit = defineEmits<{
  (e: 'auth-success', token: string): void;
}>();

const scanError = ref('');
const isScanning = ref(false);

const scanQrCode = async () => {
  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      // Подсказка, какие коды искать (или ALL для всех)
      hint: CapacitorBarcodeScannerTypeHint.ALL,
      // Важно: явно просим использовать MLKit для Android (он быстрее ZXing)
      android: {
        scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT
      },
      // Текст инструкции для пользователя (появится на экране камеры)
      scanInstructions: "Наведите камеру на QR-код"
    });

    console.log('Результат сканирования:', result.ScanResult);
    return result.ScanResult;
  } catch (error) {
    console.error('Ошибка сканирования:', error);
  }
};
</script>

<style>
.error-text {
  color: #ff4d4f;
  margin-top: 15px;
  font-size: 14px;
}
</style>
