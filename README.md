# Chat Core

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