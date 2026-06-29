import { reactive, readonly } from 'vue';
import { MessageTypeEnum } from '@pksep/yui';

interface INotificationPayload {
  title: string;
  description: unknown;
  type?: MessageTypeEnum;
}

export interface INotificationItem extends INotificationPayload {
  key: number;
  description: string;
  type: MessageTypeEnum;
}

interface INotificationState {
  items: INotificationItem[];
}

const NOTIFICATION_TIMEOUT_MS = 3000;

const state = reactive<INotificationState>({
  items: []
});

const closeNotificationTimeouts = new Map<
  number,
  ReturnType<typeof setTimeout>
>();
let nextNotificationKey = 1;

const formatNotificationDescription = (value: unknown): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(formatNotificationDescription).filter(Boolean).join(', ');
  }
  if (value instanceof Error) return value.message;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return (
      formatNotificationDescription(record.message) ||
      formatNotificationDescription(record.description) ||
      JSON.stringify(value)
    );
  }
  return String(value);
};

const clearCloseNotificationTimeout = (key: number) => {
  const timeout = closeNotificationTimeouts.get(key);

  if (!timeout) {
    return;
  }

  clearTimeout(timeout);
  closeNotificationTimeouts.delete(key);
};

export const closeNotification = (key?: number) => {
  if (typeof key !== 'number') {
    state.items.forEach(item => clearCloseNotificationTimeout(item.key));
    state.items = [];
    return;
  }

  clearCloseNotificationTimeout(key);
  state.items = state.items.filter(item => item.key !== key);
};

export const showNotification = ({
  title,
  description,
  type = MessageTypeEnum.error
}: INotificationPayload) => {
  const notification: INotificationItem = {
    key: nextNotificationKey,
    title,
    description: formatNotificationDescription(description),
    type
  };

  nextNotificationKey += 1;
  state.items = [...state.items, notification];

  closeNotificationTimeouts.set(
    notification.key,
    setTimeout(() => {
      closeNotification(notification.key);
    }, NOTIFICATION_TIMEOUT_MS)
  );
};

export const showErrorNotification = (description: unknown) => {
  showNotification({
    title: 'Ошибка',
    description,
    type: MessageTypeEnum.error
  });
};

export const useNotifications = () => ({
  state: readonly(state),
  showNotification,
  showErrorNotification,
  closeNotification
});
