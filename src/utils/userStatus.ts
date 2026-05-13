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
