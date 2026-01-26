import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { useChatApi } from './useApi';

export const initPushNotifications = async () => {
  // 1. Проверяем, что мы на нативном устройстве (Android/iOS)
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  // 2. Проверка и запрос прав
  let permStatus = await PushNotifications.checkPermissions();

  if (permStatus.receive === 'prompt') {
    permStatus = await PushNotifications.requestPermissions();
  }

  if (permStatus.receive !== 'granted') {
    console.error('Push Notifications: Permission denied');
    return;
  }

  // 3. Регистрируемся в FCM
  await PushNotifications.register();

  // --- СЛУШАТЕЛИ ---

  // А) Успешная регистрация -> Шлем токен на бэкенд через useChatApi
  PushNotifications.addListener('registration', async token => {
    try {
      const api = useChatApi();
      // Отправляем токен и платформу
      await api.post('/notifications/device', {
        token: token.value,
        platform: Capacitor.getPlatform() // 'android' или 'ios'
      });
    } catch (e) {
      console.error('Failed to send token to server:', e);
    }
  });

  // Б) Ошибка регистрации
  PushNotifications.addListener('registrationError', error => {
    console.error('Push registration error: ', error);
  });

  // В) Пришел пуш, когда приложение ОТКРЫТО
  PushNotifications.addListener('pushNotificationReceived', () => {
    // Тут можно дернуть стор, чтобы обновить счетчик непрочитанных, если нужно
  });

  // Г) Клик по пушу (из шторки)
  // PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
  //   const data = notification.notification.data;

  //   // Логика перехода
  //   if (data && data.topicId) {
  //     router.push(`/chat/${data.topicId}`);
  //   }
  // });
};

export const removePushListeners = async () => {
  if (Capacitor.isNativePlatform()) {
    await PushNotifications.removeAllListeners();
  }
};
