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

export const showNotification = ({
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
  state.open = true;
  state.key += 1;
};

export const showErrorNotification = (description: string) => {
  showNotification({
    title: 'Ошибка',
    description,
    type: MessageTypeEnum.error
  });
};

export const closeNotification = () => {
  state.open = false;
};

export const useNotifications = () => ({
  state: readonly(state),
  showNotification,
  showErrorNotification,
  closeNotification
});
