import { getUserById } from '../../../composables/useUsers';
import { useUserInfoModal } from '../../../composables/useUserInfoModal';
import { openGroupCallInviteUrl } from '../../../services/useLiveKit';
import { isGroupCallInviteUrl } from '../../../utils/groupCallInviteUrl';

const MENTION_USER_SELECTOR = '[data-user-id]';
const ANCHOR_SELECTOR = 'a[href]';

export const useMentionUserClick = () => {
  const { openUserInfo, canOpenUserInfo } = useUserInfoModal();

  const syncMentionUserInteractivity = (
    container?: HTMLElement | null
  ): void => {
    container
      ?.querySelectorAll<HTMLAnchorElement>(ANCHOR_SELECTOR)
      .forEach(anchor => {
        if (!isGroupCallInviteUrl(anchor.href)) {
          return;
        }

        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
      });

    container
      ?.querySelectorAll<HTMLElement>(MENTION_USER_SELECTOR)
      .forEach(element => {
        const userId = element.dataset.userId;
        const user = userId ? getUserById(userId) : null;

        element.dataset.userOpenable = canOpenUserInfo(user) ? 'true' : 'false';
      });
  };

  const handleMentionUserClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const anchorElement = target?.closest(
      ANCHOR_SELECTOR
    ) as HTMLAnchorElement | null;

    if (anchorElement && isGroupCallInviteUrl(anchorElement.href)) {
      event.preventDefault();
      event.stopPropagation();
      void openGroupCallInviteUrl(anchorElement.href);
      return;
    }

    const mentionElement = target?.closest(
      MENTION_USER_SELECTOR
    ) as HTMLElement | null;

    if (!mentionElement) {
      return;
    }

    const userId = mentionElement.dataset.userId;
    const user = userId ? getUserById(userId) : null;

    if (!user) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openUserInfo(user);
  };

  return {
    handleMentionUserClick,
    syncMentionUserInteractivity
  };
};
