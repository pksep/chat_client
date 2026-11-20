import {
  createDesktopNotificationActionHandler,
  DesktopReplyConfirmedError,
  type DesktopNotificationAction
} from '../utils/desktop-notification-actions';
import { getChatAuthSession } from '../utils/stored-chat-session';
import { withNetworkTimeout } from '../utils/network-timeout';
import { isChatSessionEnding } from '../composables/useAuth';
import { showErrorNotification } from '../composables/useNotifications';
import { openMessageDraft } from '../composables/useMessageDraftTransfer';
import { useChatApi } from './useApi';
import {
  activateTauriAppWindow,
  clearTauriMessageNotification
} from './useTauriNotifications';
import {
  navigateToNotificationTarget,
  requestNotificationTopicRefresh
} from './useNotificationNavigation';

const execute = createDesktopNotificationActionHandler({
  accountId: () =>
    isChatSessionEnding() ? undefined : getChatAuthSession()?.user?.id,
  post: (path, body) =>
    withNetworkTimeout(async signal => {
      const response = await useChatApi().post(path, body, {
        parsed: false,
        requset: { signal }
      });
      if (!response.ok)
        throw new Error(
          'Не удалось выполнить действие. Проверьте соединение и повторите.'
        );
      return response.json();
    }, 15_000),
  confirmed: async payload => {
    const topicId = payload.topicId as string;
    await clearTauriMessageNotification(topicId, payload.messageId as string);
    requestNotificationTopicRefresh(topicId);
  }
});

export const handleDesktopNotificationAction = async (
  payload: DesktopNotificationAction
): Promise<void> => {
  try {
    await execute(payload);
  } catch (error) {
    if (
      isChatSessionEnding() ||
      getChatAuthSession()?.user?.id !== payload.accountId
    )
      return;
    await activateTauriAppWindow();
    if (
      payload.action === 'reply' &&
      typeof payload.replyText === 'string' &&
      payload.replyText.trim() &&
      !(error instanceof DesktopReplyConfirmedError)
    ) {
      const escaped = document.createElement('div');
      escaped.textContent = payload.replyText.trim();
      openMessageDraft(
        {
          id: payload.topicId as string,
          type: payload.topicType === 'GROUP' ? 'GROUP' : 'DM'
        },
        escaped.innerHTML.replace(/\n/g, '<br>')
      );
    } else
      navigateToNotificationTarget(
        payload as { topicId: string; messageId: string }
      );
    showErrorNotification(
      error instanceof Error && /[А-Яа-яЁё]/.test(error.message)
        ? error.message
        : 'Не удалось выполнить действие уведомления.'
    );
  }
};
