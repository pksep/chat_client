import { reactive, readonly } from 'vue';
import { MessageTypeEnum } from '@pksep/yui';

interface INotificationPayload {
  title: string;
  description: string;
  type?: MessageTypeEnum;
}

export interface INotificationItem extends INotificationPayload {
  key: number;
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
    description,
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

export const showErrorNotification = (description: string) => {
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
