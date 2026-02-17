self.addEventListener('push', event => {
  event.waitUntil(
    (async () => {
      // Проверяем открытые вкладки сайта
      const clientList = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // Есть ли активная (видимая) вкладка
      const isUserActive = clientList.some(client => {
        return client.visibilityState === 'visible';
      });

      // Если пользователь в приложении — НЕ показываем push
      if (isUserActive) {
        return;
      }

      // Получаем данные уведомления
      let data = {};
      try {
        data = event.data?.json() || {};
      } catch {
        data = {
          title: 'Новое уведомление',
          body: event.data?.text() || ''
        };
      }

      const title = data.title || 'Новое уведомление';

      const options = {
        body: data.body || '',
        icon: data.icon || '/images/favicon.ico',
        data: data.url || '/'
      };

      // Показываем уведомление ТОЛЬКО если вкладка не активна
      await self.registration.showNotification(title, options);
    })()
  );
});
