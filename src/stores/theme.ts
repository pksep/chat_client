import { defineStore } from 'pinia';
import { nextTick, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import { LaunchStartup } from '../services/launchStartup';
import { persistDesktopRecovery } from '../services/desktop-recovery';

/**
 * Класс темы, который добавляется на корневой html-элемент.
 */
export type TThemeClass = 'theme-dark' | 'theme-light';

/**
 * Значение цветовой схемы, которое сохраняется в localStorage.
 */
export type TThemeStorageValue = TThemeClass;

/**
 * Набор поддерживаемых классов цветовых схем.
 */
export interface IThemeClasses {
  dark: TThemeClass;
  light: TThemeClass;
}

const THEME_STORAGE_KEY = 'erp-theme-color-scheme';
const THEME_COLORS = {
  dark: '#262a38',
  light: '#ffffff'
};
const THEME_CLASSES: IThemeClasses = {
  dark: 'theme-dark',
  light: 'theme-light'
};
const THEME_TRANSITION_DURATION_MS = 200;
let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined;
let activeThemeTransition: ViewTransition | undefined;
let themeSwitchSequence = 0;

const beginThemeTransition = (): void => {
  const root = document.documentElement;
  if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
  root.classList.add('theme-switching');
  // Сначала применяем transition к текущим цветам, затем меняем класс темы.
  void root.offsetWidth;
  themeTransitionTimer = setTimeout(() => {
    root.classList.remove('theme-switching');
    themeTransitionTimer = undefined;
  }, THEME_TRANSITION_DURATION_MS + 50);
};

const syncNativeLaunchTheme = (isDarkTheme: boolean): void => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }

  void LaunchStartup.setTheme({ dark: isDarkTheme }).catch(() => undefined);
};

/**
 * Проверяет, что значение из localStorage является поддерживаемым классом темы.
 *
 * @param value - Значение, прочитанное из localStorage.
 */
const isThemeStorageValue = (
  value: string | null
): value is TThemeStorageValue => {
  // Сравниваем значение только с поддерживаемыми классами темы.
  return value === THEME_CLASSES.dark || value === THEME_CLASSES.light;
};

/**
 * Возвращает класс темы по булевому состоянию темной схемы.
 *
 * @param isDarkTheme - Признак включения темной темы.
 */
const getThemeClassByState = (isDarkTheme: boolean): TThemeClass => {
  // Выбираем класс темной или светлой темы по текущему состоянию.
  return isDarkTheme ? THEME_CLASSES.dark : THEME_CLASSES.light;
};

/**
 * Возвращает булево состояние темной темы по классу цветовой схемы.
 *
 * @param themeClass - Класс сохраненной цветовой схемы.
 */
const getIsDarkThemeByClass = (themeClass: TThemeClass): boolean => {
  // Темная тема активна только для класса theme-dark.
  return themeClass === THEME_CLASSES.dark;
};

/**
 * Читает сохраненную цветовую схему из localStorage.
 */
const getSavedThemeClass = (): TThemeClass => {
  try {
    // Читаем сохраненный класс темы только в браузерном окружении.
    const savedThemeClass = window.localStorage.getItem(THEME_STORAGE_KEY);

    // Возвращаем сохраненную тему только если значение поддерживается.
    if (isThemeStorageValue(savedThemeClass)) return savedThemeClass;
  } catch (error) {
    // Фиксируем ошибку чтения, чтобы не ломать загрузку интерфейса.
    console.error('Ошибка чтения темы из localStorage:', error);
  }

  // По умолчанию используем светлую тему.
  return THEME_CLASSES.light;
};

/**
 * Сохраняет цветовую схему в localStorage.
 *
 * @param themeClass - Класс текущей цветовой схемы.
 */
const saveThemeClass = (themeClass: TThemeClass): void => {
  try {
    // Записываем текущий класс темы для восстановления после перезагрузки.
    window.localStorage.setItem(THEME_STORAGE_KEY, themeClass);
    void persistDesktopRecovery();
  } catch (error) {
    // Фиксируем ошибку сохранения без остановки переключения темы.
    console.error('Ошибка сохранения темы в localStorage:', error);
  }
};

/**
 * Применяет класс цветовой схемы к корневому html-элементу.
 *
 * @param themeClass - Класс цветовой схемы для применения.
 */
const applyThemeClass = (themeClass: TThemeClass): void => {
  // Получаем корневой html-элемент, где UI-kit читает класс темы.
  const rootElement = document.documentElement;

  // Удаляем оба класса, чтобы на html не осталось конфликтующей темы.
  rootElement.classList.remove(THEME_CLASSES.dark, THEME_CLASSES.light);

  // Добавляем актуальный класс цветовой схемы.
  rootElement.classList.add(themeClass);

  const isDarkTheme = themeClass === THEME_CLASSES.dark;
  rootElement.style.colorScheme = isDarkTheme ? 'dark' : 'light';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      isDarkTheme ? THEME_COLORS.dark : THEME_COLORS.light
    );
};

/**
 * Создает единое хранилище состояния цветовой схемы приложения.
 */
export const useThemeStore = defineStore('theme', () => {
  // Храним единое реактивное состояние темной темы для всего приложения.
  const isDarkTheme = ref(false);

  // Фиксируем факт одноразовой инициализации, чтобы не переопределять тему повторно.
  const isThemeInitialized = ref(false);

  /**
   * Инициализирует тему из сохраненного значения и применяет её к документу.
   */
  const initTheme = (): void => {
    // Повторная инициализация не нужна, если тема уже была восстановлена.
    if (isThemeInitialized.value) return;

    // Восстанавливаем сохраненную тему только один раз при старте приложения.
    const savedThemeClass = getSavedThemeClass();
    const initialThemeClass = savedThemeClass;

    // Синхронизируем реактивное состояние с сохраненным классом темы.
    isDarkTheme.value = getIsDarkThemeByClass(initialThemeClass);
    syncNativeLaunchTheme(isDarkTheme.value);

    // Применяем восстановленную тему к корневому элементу.
    applyThemeClass(initialThemeClass);

    // Помечаем тему как инициализированную, чтобы не выполнять этот код повторно.
    isThemeInitialized.value = true;
  };

  /**
   * Устанавливает тему, применяет её к документу и сохраняет выбор пользователя.
   *
   * @param nextIsDarkTheme - Признак включения темной темы.
   */
  const setTheme = (nextIsDarkTheme: boolean): void => {
    const shouldUseDarkTheme = nextIsDarkTheme;

    // Определяем класс темы по новому состоянию переключателя.
    const nextThemeClass = getThemeClassByState(shouldUseDarkTheme);

    const applyNextTheme = (): void => {
      isDarkTheme.value = shouldUseDarkTheme;
      applyThemeClass(nextThemeClass);
    };
    const root = document.documentElement;
    const hasChanged = !root.classList.contains(nextThemeClass);
    const sequence = ++themeSwitchSequence;
    activeThemeTransition?.skipTransition();
    activeThemeTransition = undefined;
    root.classList.remove('theme-snapshot');
    if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
    themeTransitionTimer = undefined;
    root.classList.remove('theme-switching');
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    // Нативные панели начинают тот же 200 мс переход сразу по нажатию.
    syncNativeLaunchTheme(shouldUseDarkTheme);

    if (!hasChanged || reduceMotion) {
      applyNextTheme();
    } else if (typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(async () => {
        if (sequence !== themeSwitchSequence) return;
        root.classList.add('theme-snapshot');
        applyNextTheme();
        await nextTick();
      });
      activeThemeTransition = transition;
      void transition.ready.then(
        () => {
          if (sequence !== themeSwitchSequence) return;
          root.classList.remove('theme-snapshot');
        },
        () => {
          if (sequence !== themeSwitchSequence) return;
          root.classList.remove('theme-snapshot');
          applyNextTheme();
        }
      );
      const clearTransition = (): void => {
        if (sequence !== themeSwitchSequence) return;
        root.classList.remove('theme-snapshot');
        activeThemeTransition = undefined;
      };
      void transition.finished.then(clearTransition, clearTransition);
    } else {
      beginThemeTransition();
      applyNextTheme();
    }

    // Сохраняем выбор пользователя для следующей загрузки приложения.
    saveThemeClass(nextThemeClass);
  };

  return {
    isDarkTheme,
    initTheme,
    setTheme
  };
});
