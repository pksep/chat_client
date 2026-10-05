const MENU_LAYOUT_KEY = 'chat_menu_layout';

export function readMenuLayout(
  userId?: string,
  apiBase?: string
): number | null {
  if (!userId || !apiBase) return null;
  try {
    const layout = JSON.parse(localStorage.getItem(MENU_LAYOUT_KEY) || 'null');
    return layout?.userId === userId &&
      layout.apiBase === apiBase.replace(/\/+$/, '') &&
      [3, 4, 5].includes(layout.count)
      ? layout.count
      : null;
  } catch {
    return null;
  }
}

export function saveMenuLayout(
  userId: string,
  apiBase: string,
  count: number
): void {
  try {
    localStorage.setItem(
      MENU_LAYOUT_KEY,
      JSON.stringify({ userId, apiBase: apiBase.replace(/\/+$/, ''), count })
    );
  } catch {
    // Сохранённая раскладка нужна только для скелетона, а не для доступа.
  }
  document.documentElement.dataset.startupMenuCount = String(count);
}
