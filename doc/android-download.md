# Скачать Android-приложение из профиля

В полном профиле кнопка «Скачать Android-приложение» открывает окно QR и прямую
ссылку «Скачать APK». Конфигурация загружается только при открытии окна, анонимно,
из `https://pksep.github.io/sep-chat-ui/android-download.json`, без cookies/токена.
Повторное открытие получает новый адрес; ошибка/закрытие не оставляют старый QR.

Поля: `schemaVersion: 1`, `enabled: true`, `apkUrl` и `qrImageUrl` — публичные
HTTPS-адреса. Чтобы поменять APK или QR, достаточно commit в `pksep/sep-chat-ui`,
пересборка веба/Android не требуется. Android 20001 получает свою кнопку/диалог
через `manifest-v4.json` в том же репозитории.

QR ведёт на `https://pksep.github.io/sep-chat-ui/android/`. Эта страница читает
текущий `apkUrl` и начинает скачивание. По умолчанию скачивается последний
проверенный `SEP-Chat.apk` из GitHub Releases публичного `sep-chat-ui`.
Смена версии APK не требует менять сохранённый QR. При отключении download JSON
ссылка не показывается. Встроенный старый `public/release/android/app.apk`
для этой функции не используется и в production bundle не возвращается.

Проверки: TypeScript, ESLint, production build, 6 профильных E2E desktop/mobile
и 4 проверки регрессии QR-авторизации на синтетических сессиях. Включены 280 px,
обе темы, расшифровка QR, смена URL, ошибка/повтор и уход из профиля.
