export interface UserStatusValue {
  icon: string;
  text: string;
}

export const USER_STATUS_PRESETS: UserStatusValue[] = [
  { icon: '🏖️', text: 'В отпуске' },
  { icon: '🤒', text: 'Болею' },
  { icon: '😎', text: 'Выходной' },
  { icon: '🚙', text: 'В командировке' }
];

export const normalizeUserStatus = (
  status?: Partial<UserStatusValue> | null
): UserStatusValue | null => {
  if (!status) {
    return null;
  }

  const icon = String(status.icon || '').trim();
  const text = String(status.text || '').trim();

  if (!icon || !text) {
    return null;
  }

  return { icon, text };
};

export const getCustomUserStatusPresets = (
  ex: unknown,
  currentStatus?: UserStatusValue | null
): UserStatusValue[] => {
  if (typeof ex === 'string') {
    try {
      ex = JSON.parse(ex);
    } catch {
      ex = null;
    }
  }

  const stored =
    ex && typeof ex === 'object' && 'customStatusPresets' in ex
      ? ex.customStatusPresets
      : undefined;
  // Текущий статус подхватываем только для старого профиля без списка вариантов.
  const values: unknown[] = Array.isArray(stored) ? stored : [currentStatus];
  const seen = new Set(
    USER_STATUS_PRESETS.map(status => `${status.icon}\n${status.text}`)
  );
  const presets: UserStatusValue[] = [];

  for (const value of values) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('icon' in value) ||
      !('text' in value) ||
      typeof value.icon !== 'string' ||
      typeof value.text !== 'string'
    ) {
      continue;
    }

    const status = normalizeUserStatus({ icon: value.icon, text: value.text });
    if (!status) continue;

    const key = `${status.icon}\n${status.text}`;
    if (seen.has(key)) continue;

    seen.add(key);
    presets.push(status);
  }

  return presets;
};

export const formatUserStatusLabel = (
  status?: Partial<UserStatusValue> | null
): string => {
  const normalizedStatus = normalizeUserStatus(status);

  if (!normalizedStatus) {
    return '';
  }

  return `${normalizedStatus.icon} ${normalizedStatus.text}`;
};

export const formatUserStatusText = (
  status?: Partial<UserStatusValue> | null
): string => {
  const normalizedStatus = normalizeUserStatus(status);

  if (!normalizedStatus) {
    return '';
  }

  return `${normalizedStatus.text}`;
};
