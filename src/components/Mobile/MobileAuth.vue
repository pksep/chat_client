<template>
  <main class="mobile-auth-container">
    <picture class="mobile-auth-container__logo">
      <img
        src="/images/sep-chat-logo.svg"
        alt="logotype of Chat Logo"
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
        Вход с помощью QR
      </Button>
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
      :push-key="notificationKey"
      :description="scanError"
      :type="MessageTypeEnum.error"
      @close="() => (isError = false)"
    />
  </main>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue';
import { Capacitor } from '@capacitor/core';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
  CapacitorBarcodeScannerAndroidScanningLibrary
} from '@capacitor/barcode-scanner';
import {
  PushNotification,
  Button,
  ButtonTypeEnum,
  SizesEnum,
  MessageTypeEnum
} from '@pksep/yui';

const scanError = ref('');
const isError = ref(false);
const isScanning = ref(false);
const notificationKey = ref(0);

const scanQrCode = async () => {
  isError.value = false;
  scanError.value = '';

  await nextTick();

  notificationKey.value++;

  if (!Capacitor.isNativePlatform() && !window.isSecureContext) {
    scanError.value = 'Соединение не защищено (HTTP). Камера недоступна.';
    isError.value = true;
    return;
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
    
    if (result.ScanResult) {
      isScanning.value = false;
      return result.ScanResult;
    } else {
      scanError.value = 'Сканирование отменено';
      isError.value = true;
      isScanning.value = false;
    }
  } catch (error) {
    console.error('Ошибка сканирования:', error);
    scanError.value = 'Не удалось открыть камеру';
    isError.value = true;
  } finally {
    isScanning.value = false;
  }
};
</script>