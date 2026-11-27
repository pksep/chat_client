import { reactive, readonly } from 'vue';
import { MessageTypeEnum } from '@pksep/yui';
import {
  recordErrorNotification,
  type NotificationDiagnostics
} from '../services/error-notification-telemetry';

interface INotificationPayload {
  title: string;
  description: unknown;
  type?: MessageTypeEnum;
  diagnostics?: NotificationDiagnostics;
  busy?: boolean;
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

const pauseNotificationTimeout = (key: number): void => {
  const timeout = closeNotificationTimeouts.get(key);

  if (!timeout) {
    return;
  }

  clearTimeout(timeout);
  closeNotificationTimeouts.delete(key);
};

const resumeNotificationTimeout = (key: number): void => {
  const item = state.items.find(item => item.key === key);
  if (!item || item.busy) return;

  pauseNotificationTimeout(key);
  closeNotificationTimeouts.set(
    key,
    setTimeout(() => closeNotification(key), NOTIFICATION_TIMEOUT_MS)
  );
};

export const closeNotification = (key?: number) => {
  if (typeof key !== 'number') {
    state.items.forEach(item => pauseNotificationTimeout(item.key));
    state.items = [];
    return;
  }

  pauseNotificationTimeout(key);
  state.items = state.items.filter(item => item.key !== key);
};

export const showNotification = ({
  title,
  description,
  type = MessageTypeEnum.error,
  diagnostics,
  busy = false
}: INotificationPayload) => {
  const notification: INotificationItem = {
    key: nextNotificationKey,
    title,
    description: formatNotificationDescription(description),
    type,
    busy
  };

  nextNotificationKey += 1;
  state.items = [...state.items, notification];

  resumeNotificationTimeout(notification.key);

  if (type === MessageTypeEnum.error) {
    recordErrorNotification({
      title,
      description,
      error: diagnostics?.error ?? description,
      source: diagnostics?.source,
      stack: new Error().stack
    });
  }
  return notification.key;
};

export const updateNotification = (
  key: number,
  payload: INotificationPayload
): void => {
  const item = state.items.find(item => item.key === key);
  if (!item) return;
  pauseNotificationTimeout(key);
  Object.assign(item, payload, {
    description: formatNotificationDescription(payload.description),
    type: payload.type ?? item.type,
    busy: payload.busy ?? false
  });
  resumeNotificationTimeout(key);
  if (payload.type === MessageTypeEnum.error)
    recordErrorNotification({
      title: payload.title,
      description: payload.description,
      error: payload.diagnostics?.error ?? payload.description,
      source: payload.diagnostics?.source,
      stack: new Error().stack
    });
};

export const startOperationNotification = (message: string) => {
  const key = showNotification({
    title: '',
    description: message,
    type: MessageTypeEnum.info,
    busy: true
  });
  return {
    progress: (description: string) =>
      updateNotification(key, {
        title: '',
        description,
        type: MessageTypeEnum.info,
        busy: true
      }),
    success: (description: string) =>
      updateNotification(key, {
        title: '',
        description,
        type: MessageTypeEnum.success
      }),
    error: (description: unknown) =>
      updateNotification(key, {
        title: 'Ошибка',
        description,
        type: MessageTypeEnum.error
      }),
    close: () => closeNotification(key)
  };
};

export const showErrorNotification = (
  description: unknown,
  diagnostics?: NotificationDiagnostics
) => {
  showNotification({
    title: 'Ошибка',
    description,
    type: MessageTypeEnum.error,
    diagnostics
  });
};

export const useNotifications = () => ({
  state: readonly(state),
  showNotification,
  showErrorNotification,
  closeNotification,
  pauseNotificationTimeout,
  resumeNotificationTimeout
});
