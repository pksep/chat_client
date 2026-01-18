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
import {
  BarcodeScanner,
  BarcodeFormat
} from '@capacitor-mlkit/barcode-scanning';
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';

const emit = defineEmits<{
  (e: 'auth-success', token: string): void;
}>();

const scanError = ref('');
const isScanning = ref(false);

const scanQrCode = async () => {
  scanError.value = '';
  isScanning.value = true;

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
      scanError.value =
        'Нет доступа к камере. Разрешите доступ в настройках телефона.';
    }
  } catch (e: any) {
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

<style>
.error-text {
  color: #ff4d4f;
  margin-top: 15px;
  font-size: 14px;
}
</style>
