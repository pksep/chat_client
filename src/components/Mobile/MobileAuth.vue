<template>
  <main class="mobile-auth-container">
    <picture class="mobile-auth-container__logo">
      <img
        src="/images/sep-chat-logo.svg"
        alt="logotype
      of Chat Logo"
      />
    </picture>

    <section class="mobile-auth-container__qr-content">
      <h2 class="mobile-auth-container__qr-content__title">Вход в систему</h2>
      <Button
        class="mobile-auth-container__qr-content__button"
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.medium"
        @click="scanQrCode"
        :loading="isScanning"
      >
        Вход с помощью QR</Button
      >
    </section>
    <PushNotification
      v-if="isError"
      :class="[
        'mobile-auth-container__error',
        {
          'mobile-auth-container__error--no-error': !isError
        }
      ]"
      title="Ошибка"
      :push-key="1"
      :description="scanError"
      :type="MessageTypeEnum.error"
      @close="() => (isError = false)"
    />
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
  CapacitorBarcodeScannerAndroidScanningLibrary
} from '@capacitor-mlkit/barcode-scanning';
import {
  PushNotification,
  Button,
  ButtonTypeEnum,
  SizesEnum,
  MessageTypeEnum
} from '@pksep/yui';

const scanError = ref('');
const isScanning = ref(false);
const isError = ref(false);

const scanQrCode = async () => {
  scanError.value = '';
  isScanning.value = true;
  isError.value = false;

  try {
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.ALL,
      android: {
        scanningLibrary: CapacitorBarcodeScannerAndroidScanningLibrary.MLKIT
      },
      scanInstructions: 'Наведите камеру на QR-код'
    });
    scanError.value = 'Не удалось открыть камеру';
    return result.ScanResult;
  } catch (error) {
    isError.value = true;
    console.error('Ошибка сканирования:', error);
  }
};
</script>
