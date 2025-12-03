export enum SystemMessageType {
  GROUP_CREATED = 'group_created',
  GROUP_NAME_CHANGED = 'group_name_changed',
  GROUP_MEMBER_ADDED = 'group_member_added',
  GROUP_MEMBER_REMOVED = 'group_member_removed',
  GROUP_MEMBER_QUIT = 'group_member_quit',
  GROUP_OWNER_CHANGED = 'group_owner_changed',
  GROUP_DISMISSED = 'group_dismissed',
  GROUP_MUTE_CHANGED = 'group_mute_changed',
  GROUP_ADMIN_CHANGED = 'group_admin_changed'
}

export interface SystemMessage {
  type: SystemMessageType;
  content: string;
  senderID: string;
  senderName?: string;
  targetName?: string;
  groupName?: string;
  timestamp: number;
  rawMessage: any; // Keep reference to original message
  notificationType?: number; // The original notification type from OpenIM
}

export enum OpenIMNotificationType {
  GroupCreated = 101,
  MemberAdded = 102,
  MemberKicked = 103,
  GroupNameChanged = 104,
  GroupOwnerChanged = 105,
  GroupDismissed = 106,
  MemberQuit = 107,
  GroupMuted = 108,
  GroupMemberMuted = 109,
  GroupMemberUnmuted = 110,
  GroupAdminChanged = 111,
  GroupAdminRevoked = 112,
  GroupOwnerTransferred = 113,
  GroupMemberSetToAdmin = 114,
  GroupMemberRemovedFromAdmin = 115
}

export const parseGroupNotification = (
  notificationDetail: any,
  senderName: string,
  groupName: string
): SystemMessage | null => {
  if (!notificationDetail) return null;

  const {
    opUser, // User who performed the operation
    memberList, // Affected members
    notificationType // Notification type
  } = notificationDetail;

  const opUserName =
    (opUser && opUser.nickname) ||
    (opUser && opUser.userID) ||
    senderName ||
    'Someone';

  if (notificationType) {
    switch (notificationType) {
      case OpenIMNotificationType.GroupCreated:
        return {
          type: SystemMessageType.GROUP_CREATED,
          content: `${opUserName} created the group "${groupName}"`,
          senderID: opUser?.userID || '',
          senderName: opUserName,
          groupName: groupName,
          timestamp: Date.now(),
          rawMessage: notificationDetail,
          notificationType
        };

      case OpenIMNotificationType.GroupNameChanged:
        return {
          type: SystemMessageType.GROUP_NAME_CHANGED,
          content: `${opUserName} changed the group name to "${notificationDetail.group?.groupName || groupName}"`,
          senderID: opUser?.userID || '',
          senderName: opUserName,
          groupName: notificationDetail.group?.groupName || groupName,
          timestamp: Date.now(),
          rawMessage: notificationDetail,
          notificationType
        };

      case OpenIMNotificationType.MemberAdded:
        if (memberList && memberList.length > 0) {
          const memberNames = memberList
            .map(m => m.nickname || m.userID)
            .join(', ');
          return {
            type: SystemMessageType.GROUP_MEMBER_ADDED,
            content: `${opUserName} added ${memberNames} to the group`,
            senderID: opUser?.userID || '',
            senderName: opUserName,
            groupName: groupName,
            timestamp: Date.now(),
            rawMessage: notificationDetail,
            notificationType
          };
        }
        break;

      case OpenIMNotificationType.MemberKicked:
        if (memberList && memberList.length > 0) {
          const memberNames = memberList
            .map(m => m.nickname || m.userID)
            .join(', ');
          return {
            type: SystemMessageType.GROUP_MEMBER_REMOVED,
            content: `${opUserName} removed ${memberNames} from the group`,
            senderID: opUser?.userID || '',
            senderName: opUserName,
            groupName: groupName,
            timestamp: Date.now(),
            rawMessage: notificationDetail,
            notificationType
          };
        }
        break;

      case OpenIMNotificationType.GroupOwnerChanged:
      case OpenIMNotificationType.GroupOwnerTransferred: {
        const newOwner =
          notificationDetail.newGroupOwnerInfo ||
          notificationDetail.newOwnerInfo;
        return {
          type: SystemMessageType.GROUP_OWNER_CHANGED,
          content: `${opUserName} transferred group ownership to ${newOwner?.nickname || newOwner?.userID || 'unknown'}`,
          senderID: opUser?.userID || '',
          senderName: opUserName,
          groupName: groupName,
          timestamp: Date.now(),
          rawMessage: notificationDetail,
          notificationType
        };
      }

      case OpenIMNotificationType.GroupDismissed:
        return {
          type: SystemMessageType.GROUP_DISMISSED,
          content: `${opUserName} dismissed the group`,
          senderID: opUser?.userID || '',
          senderName: opUserName,
          groupName: groupName,
          timestamp: Date.now(),
          rawMessage: notificationDetail,
          notificationType
        };

      case OpenIMNotificationType.MemberQuit:
        return {
          type: SystemMessageType.GROUP_MEMBER_QUIT,
          content: `${opUserName} left the group`,
          senderID: opUser?.userID || '', // User who left
          senderName: opUserName,
          groupName: groupName,
          timestamp: Date.now(),
          rawMessage: notificationDetail,
          notificationType
        };

      case OpenIMNotificationType.GroupMuted:
        return {
          type: SystemMessageType.GROUP_MUTE_CHANGED,
          content: `${notificationDetail.groupMutedTime === 0 ? `${opUserName} unmuted the group` : `${opUserName} muted the group indefinitely`}`,
          senderID: opUser?.userID || '',
          senderName: opUserName,
          groupName: groupName,
          timestamp: Date.now(),
          rawMessage: notificationDetail,
          notificationType
        };

      case OpenIMNotificationType.GroupMemberMuted:
      case OpenIMNotificationType.GroupMemberUnmuted:
        if (memberList && memberList.length > 0) {
          const targetName =
            memberList[0]?.nickname || memberList[0]?.userID || 'someone';
          const action =
            notificationType === OpenIMNotificationType.GroupMemberMuted
              ? 'muted'
              : 'unmuted';
          return {
            type: SystemMessageType.GROUP_MUTE_CHANGED,
            content: `${opUserName} ${action} ${targetName}`,
            senderID: opUser?.userID || '',
            senderName: opUserName,
            groupName: groupName,
            timestamp: Date.now(),
            rawMessage: notificationDetail,
            notificationType
          };
        }
        break;

      case OpenIMNotificationType.GroupAdminChanged:
      case OpenIMNotificationType.GroupMemberSetToAdmin:
        if (memberList && memberList.length > 0) {
          const adminNames = memberList
            .map(m => m.nickname || m.userID)
            .join(', ');
          return {
            type: SystemMessageType.GROUP_ADMIN_CHANGED,
            content: `${opUserName} made ${adminNames} an admin`,
            senderID: opUser?.userID || '',
            senderName: opUserName,
            groupName: groupName,
            timestamp: Date.now(),
            rawMessage: notificationDetail,
            notificationType
          };
        }
        break;

      case OpenIMNotificationType.GroupAdminRevoked:
      case OpenIMNotificationType.GroupMemberRemovedFromAdmin:
        if (memberList && memberList.length > 0) {
          const adminNames = memberList
            .map(m => m.nickname || m.userID)
            .join(', ');
          return {
            type: SystemMessageType.GROUP_ADMIN_CHANGED,
            content: `${opUserName} revoked admin status from ${adminNames}`,
            senderID: opUser?.userID || '',
            senderName: opUserName,
            groupName: groupName,
            timestamp: Date.now(),
            rawMessage: notificationDetail,
            notificationType
          };
        }
        break;
    }
  }

  if (
    notificationDetail.group &&
    notificationDetail.group.createTime === notificationDetail.operationTime
  ) {
    return {
      type: SystemMessageType.GROUP_CREATED,
      content: `${opUserName} created the group "${groupName}"`,
      senderID: opUser?.userID || '',
      senderName: opUserName,
      groupName: groupName,
      timestamp: Date.now(),
      rawMessage: notificationDetail,
      notificationType: notificationType
    };
  }

  return null;
};
