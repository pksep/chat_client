# Chat Core

## Desktop (Tauri, Windows)

Для разработки нужны Bun, Rust с MSVC toolchain, Visual Studio C++ Build Tools
и Microsoft Edge WebView2 Runtime.

```bash
bun install
bun run tauri:dev
```

Приложение использует Vite на `http://localhost:5173`. Для установщика:
`bun run tauri:build`. Чтобы сессия сохранялась после перезапуска, при входе
выберите «Запомнить аккаунт».

Документы скачиваются в `Загрузки/SEP Chat`. Стрелка означает, что вложение
нужно скачать; значок файла — что локальная копия доступна для открытия.
В контекстном меню скачанного вложения есть «Показать в папке».

Авторизация Tauri использует нативный HTTP и хранилище HttpOnly-cookie WebView2,
чтобы локальный адрес приложения не мешал продлению входа через SameSite=Lax.
Dev-сборка не регистрируется в автозапуске Windows. Release регистрирует текущий
exe с `--autostart` и сохраняет отключение автозапуска в диспетчере задач.

Статус работ и сценарии проверки: [план Tauri desktop](doc/tauri-desktop-plan.md).

Версия и обновления доступны в профиле Tauri. Для подписанной release-сборки
`bun run tauri:build` нужны `DESKTOP_VERSION` и существующий ключ подписи CI.
Для первого установщика, передаваемого вручную, используйте явный режим
`--bootstrap --bundles nsis` с `DESKTOP_VERSION`; последующие автоматические
обновления публикуются подписанными через Desktop Builds.
Подробности каналов, сервера и первого запуска: [обновления desktop](doc/desktop-updates.md).

Это основной клиент чата для проекта SEP. Это современное кроссплатформенное приложение для чата, созданное с использованием Vue.js и Capacitor, что позволяет ему работать в вебе, на iOS и Android из единой кодовой базы.

## Технологический стек

*   **Фреймворк**: [Vue.js](https://vuejs.org/)
*   **Язык**: [TypeScript](https://www.typescriptlang.org/)
*   **Инструмент сборки**: [Vite](https://vitejs.dev/)
*   **Мобильная разработка**: [Capacitor](https://capacitorjs.com/)
*   **Линтинг**: [ESLint](https://eslint.org/)
*   **Форматирование**: [Prettier](https://prettier.io/)
*   **E2E-тестирование**: [Playwright](https://playwright.dev/)

## Начало работы

### Предварительные требования

*   [Node.js](https://nodejs.org/) (версия указана в `.nvmrc` или `mise.toml`)
*   [Bun](https://bun.sh/)
*   [Android Studio](https://developer.android.com/studio) для разработки под Android
*   [Xcode](https://developer.apple.com/xcode/) для разработки под iOS

### Установка

1.  Клонируйте репозиторий:
    ```bash
    git clone <URL-репозитория>
    ```
2.  Установите зависимости:
    ```bash
    bun install
    ```

### Разработка

Чтобы запустить сервер разработки, выполните:

```bash
bun run start:dev
```

Чтобы запустить на Android 
- Установить AndoidStudio https://developer.android.com/studio?hl=ru
- Установить зависимости и SDK в AndoidStudia
- Подключить Смартфон к ПК по USB 
- На смартфоне нужно включить режим разработчика и режим передачи файлов

Запустить следующие команды:
```bash
bun run sync

bun run start:android
```


## Доступные скрипты

| Скрипт                | Описание                                                |
| :-------------------- | :------------------------------------------------------ |
| `start:dev`           | Запускает сервер разработки с Vite.                     |
| `start`               | Предварительный просмотр сборки для продакшена.         |
| `lint`                | Выполняет линтинг и исправляет исходные файлы.          |
| `build`               | Собирает приложение для продакшена.                     |
| `build:prod`          | Создает производственную сборку для приложения.         |
| `test:e2e`            | Запускает сквозные тесты с Playwright.                  |
| `test:e2e:ui`         | Запускает сквозные тесты с Playwright в UI-режиме.      |
| `format`              | Форматирует код с Prettier.                             |
| `prepare`             | Устанавливает git-хуки Lefthook.                        |
| `start:ios`           | Собирает приложение и открывает его в Xcode.            |
| `start:android`       | Собирает приложение и открывает его в Android Studio.   |
| `sync`                | Синхронизирует веб-сборку с нативными проектами Capacitor. |
| `generate:assets`     | Генерирует ресурсы для проекта iOS.                     |


## Управление версиями

Проект использует [CalVer](https://calver.org) для управления версиями: `ГГ.ММ.ПАТЧ`.

## Лицензия

Этот проект распространяется под лицензией [SEP_ERP_CLIENT License](./LICENSE).

## Zerocracy Progress
[![Zerocracy](https://www.zerocracy.com/badge/pksep/chat_client.svg)](https://pksep.github.io/chat_client/)
