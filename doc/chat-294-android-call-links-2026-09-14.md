# CHAT-294: ссылки звонков в Android

Проверка выполнена в ветке `chat-294` на физическом Android 16 и Android
Studio AVD `emulator-5556` с production-ссылкой вида
`https://chat.pksep.ru/?callRoom=...&callInvite=...`. Значение invite-токена
в отчёты и логи не записывалось.

## Реализация

- Android Manifest регистрирует verified App Link для `chat.pksep.ru`.
- Нативный запуск считывает ссылку до ожидания первого WebSocket и оставляет
  WebView на внутреннем origin `https://localhost`.
- Приглашение ставится в очередь до готовности `ChatSDK`; если до готовности
  пришло несколько ссылок, обрабатывается последняя.
- Системные повторы одного intent объединяются в течение 30 секунд, при этом
  отдельное более позднее нажатие той же ссылки разрешено.
- Результат `/api/calls/invite-preview` передаётся в LiveKit-поток без второго
  запроса. Для истёкшего приглашения тяжёлые модули звонка не загружаются.

## Результаты Android

На физическом телефоне холодный `TotalTime` составил 2220 мс. Приложение
осталось в `sep.pksep.app`, origin WebView — `https://localhost`; браузер не
открывался. Был ровно один запрос `/api/calls/invite-preview`, ожидаемо
вернувший 404 для уже завершённого тестового звонка.

На AVD холодный `TotalTime` составил 2425 мс. Preview-запрос начался на отметке
861 мс WebView и был единственным. Двадцать тёплых App Link intent за 3,19 с
также дали один HTTP-запрос. Для истёкшего приглашения не загружались
`useLiveKit` (~77 КБ), `calls-livekit` (~559 КБ) и `calls-mediapipe` (~129 КБ).

Артефакт AVD:
`artifacts/chat-294-android-call-link-emulator-5556-2026-09-14.json`.

## Проверки и ограничение production

Прошли 8 фокусных Bun-тестов, `vue-tsc --noEmit`, Android Vite build,
Capacitor copy, Gradle `assembleDebug`, 68/68 связанных Playwright-сценариев
и 2/2 теста `:app:connectedDebugAndroidTest`.

Локальный build содержит корректный `public/.well-known/assetlinks.json` для
`sep.pksep.app`. На момент проверки production endpoint
`https://chat.pksep.ru/.well-known/assetlinks.json` возвращал SPA HTML с
`content-type: text/html`. После выкладки frontend-файла endpoint должен
возвращать JSON; только после этого новая установка Android сможет выбрать
приложение автоматически без ручного разрешения домена. На тестовых
устройствах разрешение домена было включено вручную.

Пример приглашения уже истёк, поэтому реальное подключение к активной LiveKit
комнате этим прогоном не проверялось. Основной требуемый сценарий — обработка
в приложении без браузерного редиректа — подтверждён.
