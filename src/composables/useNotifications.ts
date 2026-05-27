import { reactive, readonly } from 'vue';
import { MessageTypeEnum } from '@pksep/yui';

interface INotificationState {
  open: boolean;
  title: string;
  description: string;
  type: MessageTypeEnum;
  key: number;
}

const state = reactive<INotificationState>({
  open: false,
  title: '',
  description: '',
  type: MessageTypeEnum.error,
  key: 0
});
let reopenNotificationTimeout: ReturnType<typeof setTimeout> | null = null;

const applyNotificationState = ({
  title,
  description,
  type = MessageTypeEnum.error
}: {
  title: string;
  description: string;
  type?: MessageTypeEnum;
}) => {
  state.title = title;
  state.description = description;
  state.type = type;
  state.key += 1;
  state.open = true;
};

export const showNotification = ({
  title,
  description,
  type = MessageTypeEnum.error
}: {
  title: string;
  description: string;
  type?: MessageTypeEnum;
}) => {
  if (reopenNotificationTimeout) {
    clearTimeout(reopenNotificationTimeout);
    reopenNotificationTimeout = null;
  }

  if (state.open) {
    state.open = false;
    reopenNotificationTimeout = setTimeout(() => {
      reopenNotificationTimeout = null;
      applyNotificationState({ title, description, type });
    }, 0);
    return;
  }

  applyNotificationState({ title, description, type });
};

export const showErrorNotification = (description: string) => {
  showNotification({
    title: 'Ошибка',
    description,
    type: MessageTypeEnum.error
  });
};

export const closeNotification = () => {
  if (reopenNotificationTimeout) {
    clearTimeout(reopenNotificationTimeout);
    reopenNotificationTimeout = null;
  }

  state.open = false;
};

export const useNotifications = () => ({
  state: readonly(state),
  showNotification,
  showErrorNotification,
  closeNotification
});
