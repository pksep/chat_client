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
  BarcodeScanner,
  BarcodeFormat
} from '@capacitor-mlkit/barcode-scanning';
import {
  PushNotification,
  Button,
  ButtonTypeEnum,
  SizesEnum,
  MessageTypeEnum
} from '@pksep/yui';

const emit = defineEmits<{
  (e: 'auth-success', token: string): void;
}>();

const scanError = ref('');
const isScanning = ref(false);
const isError = ref(false);

const scanQrCode = async () => {
  scanError.value = '';
  isScanning.value = true;
  isError.value = false;

  try {
    const { camera } = await BarcodeScanner.requestPermissions();

    if (camera === 'granted' || camera === 'limited') {
      const { barcodes } = await BarcodeScanner.scan({
        formats: [BarcodeFormat.QrCode]
      });

      if (barcodes.length > 0) {
        const token = barcodes[0].rawValue;
        console.log('QR Scan Success:', token);

        emit('auth-success', token);
      }
    } else {
      isError.value = true;
      scanError.value = 'Не удалось открыть камеру';
    }
  } catch (e: any) {
    isError.value = true;
    console.error('Ошибка сканирования:', e);
    if (e.message.includes('canceled')) {
      scanError.value = '';
    } else {
      scanError.value = 'Ошибка запуска камеры: ' + e.message;
    }
  } finally {
    isScanning.value = false;
  }
};
</script>
