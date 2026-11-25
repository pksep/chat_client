export interface PendingWidgetSettings {
  id: string;
  siteId: string;
  body: { version: number; settings: unknown };
}

export function readWidgetSettingsDrafts(key: string): PendingWidgetSettings[] {
  try {
    const drafts: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');

    return Array.isArray(drafts)
      ? drafts.filter(
          (draft): draft is PendingWidgetSettings =>
            draft &&
            typeof draft.id === 'string' &&
            typeof draft.siteId === 'string' &&
            /^[\w:-]{1,100}$/.test(draft.siteId) &&
            Number.isSafeInteger(draft.body?.version) &&
            Boolean(draft.body.settings)
        )
      : [];
  } catch {
    return [];
  }
}

function writeWidgetSettingsDrafts(
  key: string,
  drafts: PendingWidgetSettings[]
): void {
  try {
    if (drafts.length) localStorage.setItem(key, JSON.stringify(drafts));
    else localStorage.removeItem(key);
  } catch {
    // При запрете хранилища остаётся обычная отправка запроса.
  }
}

export function rememberWidgetSettingsDraft(
  key: string,
  draft: PendingWidgetSettings
): void {
  writeWidgetSettingsDrafts(key, [
    ...readWidgetSettingsDrafts(key).filter(
      item => item.siteId !== draft.siteId
    ),
    draft
  ]);
}

export function forgetWidgetSettingsDraft(key: string, id: string): void {
  writeWidgetSettingsDrafts(
    key,
    readWidgetSettingsDrafts(key).filter(item => item.id !== id)
  );
}

export function serializeWidgetSettings(value: unknown): string | undefined {
  return JSON.stringify(value, (_key, item: unknown): unknown =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(
          Object.entries(item).sort(([left], [right]) =>
            left.localeCompare(right)
          )
        )
      : item
  );
}
