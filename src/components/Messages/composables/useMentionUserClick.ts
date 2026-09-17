import type { IUser } from '../../interfaces/interfaces';
import { currentGroup } from '../../../composables/useGroup';
import { getTopicList } from '../../../composables/useTopics';
import { getUserById, getUsersList } from '../../../composables/useUsers';
import { useUserInfoModal } from '../../../composables/useUserInfoModal';
import { getBotUsername, isBotUser } from '../../../utils/bot';
import { isGroupCallInviteUrl } from '../../../utils/groupCallInviteUrl';
import { parseUserEx } from '../../../utils/parseUserEx';

const MENTION_USER_SELECTOR = '[data-user-id]';
const ANCHOR_SELECTOR = 'a[href]';
const SKIP_TEXT_MENTION_SELECTOR = `${MENTION_USER_SELECTOR}, ${ANCHOR_SELECTOR}, pre, code, script, style`;
const TEXT_MENTION_CLASS = 'message-content__text-mention';
const MENTION_WORD_CHAR_PATTERN = /[\p{L}\p{N}_-]/u;
const HTML_ANCHOR_PATTERN = /<a(?:\s|>)/i;

export const hasMessageInteractivityCandidates = (
  value?: string | null
): boolean => {
  if (!value) {
    return false;
  }

  return (
    value.includes('@') ||
    value.includes('data-user-id') ||
    HTML_ANCHOR_PATTERN.test(value)
  );
};

type MentionCandidate = {
  alias: string;
  aliasLowerCase: string;
  user: IUser;
};

type MentionMatch = {
  mentionLength: number;
  user: IUser;
};

const normalizeMentionAlias = (value?: string | null): string =>
  (value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\u00a0/g, ' ');

const normalizeMentionText = (value: string): string =>
  value.replace(/\u00a0/g, ' ').toLocaleLowerCase();

const getUserMentionAliases = (user: IUser): string[] => {
  const ex = parseUserEx(user.ex);
  const aliases = [user.initials, user.nickname, ex.erpInitials];

  if (isBotUser(user)) {
    aliases.push(getBotUsername(user));
  }

  return aliases.filter((value): value is string => Boolean(value));
};

const addUserCandidate = (
  map: Map<string, MentionCandidate>,
  user?: IUser | null
) => {
  if (!user?.id) {
    return;
  }

  getUserMentionAliases(user).forEach(value => {
    const alias = normalizeMentionAlias(value);
    const aliasLowerCase = normalizeMentionText(alias);

    if (alias && !map.has(aliasLowerCase)) {
      map.set(aliasLowerCase, {
        alias,
        aliasLowerCase,
        user
      });
    }
  });
};

const getMentionCandidates = (): MentionCandidate[] => {
  const usersByAlias = new Map<string, MentionCandidate>();

  getUsersList().forEach(user => addUserCandidate(usersByAlias, user));
  currentGroup.value?.members?.forEach(user =>
    addUserCandidate(usersByAlias, user)
  );
  getTopicList().forEach(topic => {
    addUserCandidate(usersByAlias, topic.user);
    topic.members?.forEach(user => addUserCandidate(usersByAlias, user));
  });

  return [...usersByAlias.values()].sort(
    (first, second) => second.alias.length - first.alias.length
  );
};

const getMentionUserById = (userId: string): IUser | undefined => {
  const storeUser = getUserById(userId);

  if (storeUser) {
    return storeUser;
  }

  const groupUser = currentGroup.value?.members?.find(
    user => String(user.id) === userId
  );

  if (groupUser) {
    return groupUser;
  }

  for (const topic of getTopicList()) {
    if (topic.user?.id && String(topic.user.id) === userId) {
      return topic.user;
    }

    const member = topic.members?.find(user => String(user.id) === userId);

    if (member) {
      return member;
    }
  }

  return undefined;
};

const hasMentionBoundary = (
  text: string,
  startIndex: number,
  mentionLength: number
): boolean => {
  const previousChar = startIndex > 0 ? text[startIndex - 1] : '';
  const nextChar = text[startIndex + mentionLength] || '';

  return (
    previousChar !== '@' &&
    (!previousChar || !MENTION_WORD_CHAR_PATTERN.test(previousChar)) &&
    (!nextChar || !MENTION_WORD_CHAR_PATTERN.test(nextChar))
  );
};

const shouldSkipTextNode = (node: Text, container: HTMLElement): boolean => {
  let element = node.parentElement;

  while (element && element !== container) {
    if (element.matches(SKIP_TEXT_MENTION_SELECTOR)) {
      return true;
    }

    element = element.parentElement;
  }

  return false;
};

const getTextNodes = (container: HTMLElement): Text[] => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;

    if (textNode.textContent?.includes('@')) {
      nodes.push(textNode);
    }

    currentNode = walker.nextNode();
  }

  return nodes;
};

const findTextMention = (
  text: string,
  startIndex: number,
  mentionCandidates: MentionCandidate[],
  canOpenUserInfo: (user?: IUser | null) => boolean
): MentionMatch | null => {
  for (const candidate of mentionCandidates) {
    const mentionLength = candidate.alias.length + 1;
    const mentionText = text.slice(startIndex, startIndex + mentionLength);

    if (
      mentionText.length !== mentionLength ||
      normalizeMentionText(mentionText.slice(1)) !== candidate.aliasLowerCase ||
      !canOpenUserInfo(candidate.user) ||
      !hasMentionBoundary(text, startIndex, mentionLength)
    ) {
      continue;
    }

    return {
      mentionLength,
      user: candidate.user
    };
  }

  return null;
};

const wrapMentionTextNode = (
  node: Text,
  mentionCandidates: MentionCandidate[],
  canOpenUserInfo: (user?: IUser | null) => boolean
): void => {
  const text = node.textContent || '';
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let hasReplacement = false;
  let mentionStartIndex = text.indexOf('@');

  while (mentionStartIndex !== -1) {
    const match = findTextMention(
      text,
      mentionStartIndex,
      mentionCandidates,
      canOpenUserInfo
    );

    if (!match) {
      mentionStartIndex = text.indexOf('@', mentionStartIndex + 1);
      continue;
    }

    if (mentionStartIndex > lastIndex) {
      fragment.append(
        document.createTextNode(text.slice(lastIndex, mentionStartIndex))
      );
    }

    const mentionText = text.slice(
      mentionStartIndex,
      mentionStartIndex + match.mentionLength
    );
    const mentionElement = document.createElement('span');
    mentionElement.className = `link ${TEXT_MENTION_CLASS}`;
    mentionElement.dataset.userId = String(match.user.id);
    mentionElement.textContent = mentionText;
    fragment.append(mentionElement);

    lastIndex = mentionStartIndex + match.mentionLength;
    hasReplacement = true;
    mentionStartIndex = text.indexOf('@', lastIndex);
  }

  if (!hasReplacement) {
    return;
  }

  if (lastIndex < text.length) {
    fragment.append(document.createTextNode(text.slice(lastIndex)));
  }

  node.replaceWith(fragment);
};

const syncTextMentions = (
  container: HTMLElement,
  canOpenUserInfo: (user?: IUser | null) => boolean
): void => {
  const textNodes = getTextNodes(container);

  if (textNodes.length === 0) {
    return;
  }

  const mentionCandidates = getMentionCandidates();

  if (mentionCandidates.length === 0) {
    return;
  }

  textNodes.forEach(node => {
    if (shouldSkipTextNode(node, container)) {
      return;
    }

    wrapMentionTextNode(node, mentionCandidates, canOpenUserInfo);
  });
};

export const useMentionUserClick = () => {
  const { openUserInfo, canOpenUserInfo } = useUserInfoModal();

  const syncMentionUserInteractivity = (
    container?: HTMLElement | null
  ): void => {
    if (!container) {
      return;
    }

    container
      .querySelectorAll<HTMLAnchorElement>(ANCHOR_SELECTOR)
      .forEach(anchor => {
        if (
          !isGroupCallInviteUrl(anchor.href, {
            allowTrustedOrigin: true
          })
        ) {
          return;
        }

        anchor.removeAttribute('target');
        anchor.removeAttribute('rel');
      });

    if (container.textContent?.includes('@')) {
      syncTextMentions(container, canOpenUserInfo);
    }

    container
      .querySelectorAll<HTMLElement>(MENTION_USER_SELECTOR)
      .forEach(element => {
        const userId = element.dataset.userId;
        const user = userId ? getMentionUserById(userId) : null;

        element.dataset.userOpenable = canOpenUserInfo(user) ? 'true' : 'false';
      });
  };

  const handleMentionUserClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement | null;
    const anchorElement = target?.closest(
      ANCHOR_SELECTOR
    ) as HTMLAnchorElement | null;

    if (
      anchorElement &&
      isGroupCallInviteUrl(anchorElement.href, {
        allowTrustedOrigin: true
      })
    ) {
      const inviteUrl = anchorElement.href;
      event.preventDefault();
      event.stopPropagation();
      void import('../../../services/useLiveKit').then(
        ({ openGroupCallInviteUrl }) =>
          openGroupCallInviteUrl(inviteUrl, { allowTrustedOrigin: true })
      );
      return;
    }

    const mentionElement = target?.closest(
      MENTION_USER_SELECTOR
    ) as HTMLElement | null;

    if (!mentionElement) {
      return;
    }

    const userId = mentionElement.dataset.userId;
    const user = userId ? getMentionUserById(userId) : null;

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
