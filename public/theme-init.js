(() => {
  const storageKey = 'erp-theme-color-scheme';
  const darkThemeClass = 'theme-dark';
  const lightThemeClass = 'theme-light';
  let themeClass = lightThemeClass;

  try {
    const savedThemeClass = window.localStorage.getItem(storageKey);

    if (
      savedThemeClass === darkThemeClass ||
      savedThemeClass === lightThemeClass
    ) {
      themeClass = savedThemeClass;
    }
  } catch {
    // Keep the light default when storage is unavailable.
  }

  const rootElement = document.documentElement;
  const isDarkTheme = themeClass === darkThemeClass;

  rootElement.classList.remove(darkThemeClass, lightThemeClass);
  rootElement.classList.add(themeClass);
  rootElement.style.colorScheme = isDarkTheme ? 'dark' : 'light';

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDarkTheme ? '#212531' : '#f8f9fd');
})();
