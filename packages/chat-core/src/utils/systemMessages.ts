export class SystemMessageType {
  static readonly GROUP_CREATED = 'group_created';
  static readonly GROUP_NAME_CHANGED = 'group_name_changed';
  static readonly GROUP_MEMBER_ADDED = 'group_member_added';
  static readonly GROUP_MEMBER_REMOVED = 'group_member_removed';
  static readonly GROUP_MEMBER_QUIT = 'group_member_quit';
  static readonly GROUP_OWNER_CHANGED = 'group_owner_changed';
  static readonly GROUP_DISMISSED = 'group_dismissed';
  static readonly GROUP_MUTE_CHANGED = 'group_mute_changed';
  static readonly GROUP_ADMIN_CHANGED = 'group_admin_changed';
}

export interface SystemMessage {
  type: string;
  content: string;
  senderID: string;
  senderName?: string;
  targetName?: string;
  groupName?: string;
  timestamp: number;
  rawMessage: any;
  notificationType?: number;
}

export class OpenIMNotificationType {
  static readonly GroupCreated = 1501;
  static readonly MemberAdded = 102;
  static readonly MemberKicked = 103;
  static readonly GroupNameChanged = 1520;
  static readonly GroupOwnerChanged = 105;
  static readonly GroupDismissed = 1515;
  static readonly MemberQuit = 107;
  static readonly GroupMuted = 1514;
  static readonly GroupMemberMuted = 109;
  static readonly GroupMemberUnmuted = 110;
  static readonly GroupAdminChanged = 111;
  static readonly GroupAdminRevoked = 112;
  static readonly GroupOwnerTransferred = 113;
  static readonly GroupMemberSetToAdmin = 114;
  static readonly GroupMemberRemovedFromAdmin = 115;
  static readonly MemberInvited = 1509;
}

export const parseGroupNotification = (message: any): string | null => {
  if (!message?.contentType || !message.notificationElem?.detail) return null;

  let detail: any;
  try {
    detail = JSON.parse(message.notificationElem.detail);
  } catch (e) {
    return null;
  }

  const contentType = message.contentType;
  const opUserName = detail.opUser?.nickname || 'Someone';
  const groupName = detail.group?.groupName || '';

  let memberList: any[] = [];
  let targetName: string = '';
  let newOwnerName: string = '';
  let adminNames: string = '';
  let groupMuteTime: number = 0;
  let muteEndTime: number = 0;

  switch (contentType) {
    case OpenIMNotificationType.GroupCreated:
      return `${opUserName} создал группу "${groupName}"`;

    case OpenIMNotificationType.GroupNameChanged:
      return `${opUserName} изменил название группы на "${groupName}"`;

    case OpenIMNotificationType.MemberAdded:
    case OpenIMNotificationType.MemberInvited:
      memberList = detail?.invitedUserList || [];
      if (memberList.length > 0) {
        const memberNames = memberList
          .map((m: any) => m.nickname || m.userID)
          .join(', ');
        return `${opUserName} добавил ${memberNames} в группу`;
      }
      return null;

    case OpenIMNotificationType.MemberKicked:
      memberList = detail?.kickedUserList || detail?.invitedUserList || []; // Assume kickedUserList, fallback to invited if schema varies
      if (memberList.length > 0) {
        const memberNames = memberList
          .map((m: any) => m.nickname || m.userID)
          .join(', ');
        return `${opUserName} удалил ${memberNames} из группы`;
      }
      return null;

    /*
    case OpenIMNotificationType.GroupOwnerTransferred:
      const newOwner =
        detail?.newGroupOwnerInfo ||
        detail?.newOwnerInfo ||
        detail?.inviterUser;
      newOwnerName = newOwner?.nickname || newOwner?.userID || 'неизвестному';
      return `${opUserName} передал права владельца ${newOwnerName}`;
       */

    case OpenIMNotificationType.GroupDismissed:
      return `${opUserName} запретил сообщения в группе "${groupName}"`;

    case OpenIMNotificationType.MemberQuit:
      return `${opUserName} покинул группу "${groupName}"`;

    case OpenIMNotificationType.GroupMuted:
      groupMuteTime = detail?.groupMutedTime || 0;
      if (groupMuteTime === 0) {
        return `${opUserName} снял запрет сообщений в группе "${groupName}"`;
      } else {
        return `${opUserName} запретил сообщения в группе "${groupName}"`;
      }

    case OpenIMNotificationType.GroupMemberMuted:
      memberList = detail?.invitedUserList || [];
      targetName =
        memberList[0]?.nickname || memberList[0]?.userID || 'кого-то';
      muteEndTime = detail?.muteEndTime || 0;
      if (muteEndTime === 0) {
        return `${opUserName} заглушил ${targetName} навсегда`;
      } else {
        return `${opUserName} заглушил ${targetName}`;
      }

    case OpenIMNotificationType.GroupMemberUnmuted:
      memberList = detail?.invitedUserList || [];
      targetName =
        memberList[0]?.nickname || memberList[0]?.userID || 'кого-то';
      return `${opUserName} снял заглушение с ${targetName}`;

    case OpenIMNotificationType.GroupAdminChanged:
      memberList = detail?.invitedUserList || [];
      if (memberList.length > 0) {
        adminNames = memberList
          .map((m: any) => m.nickname || m.userID)
          .join(', ');
        return `${opUserName} изменил роль администратора для ${adminNames}`;
      }
      return null;

    case OpenIMNotificationType.GroupAdminRevoked:
      memberList = detail?.invitedUserList || [];
      if (memberList.length > 0) {
        adminNames = memberList
          .map((m: any) => m.nickname || m.userID)
          .join(', ');
        return `${opUserName} отозвал права администратора у ${adminNames}`;
      }
      return null;

    case OpenIMNotificationType.GroupMemberSetToAdmin:
      memberList = detail?.invitedUserList || [];
      if (memberList.length > 0) {
        adminNames = memberList
          .map((m: any) => m.nickname || m.userID)
          .join(', ');
        return `${opUserName} назначил ${adminNames} администратором`;
      }
      return null;

    case OpenIMNotificationType.GroupMemberRemovedFromAdmin:
      memberList = detail?.invitedUserList || [];
      if (memberList.length > 0) {
        adminNames = memberList
          .map((m: any) => m.nickname || m.userID)
          .join(', ');
        return `${opUserName} снял права администратора с ${adminNames}`;
      }
      return null;

    default:
      return null;
  }
};
