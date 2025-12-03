// Type definitions for message processing
export interface Message {
  clientMsgID?: string;
  sendID: string;
  recvID: string;
  groupID?: string;
  contentType: number;
  textElem?: {
    content?: string;
  };
  fileElem?: {
    fileName?: string;
  };
  pictureElem?: {
    sourcePath?: string;
  };
  notificationElem?: {
    detail?: string;
  };
  sendTime?: number;
  isRead?: boolean;
  latestMsg?: string;
  latestMsgSendTime?: number;
  unreadCount?: number;
  userID?: string;
  conversationID?: string;
  showName?: string;
  faceURL?: string;
  isPinned?: boolean;
  group?: {
    createTime?: number;
  };
  operationTime?: number;
  memberList?: any[];
}

// Define specific types for notification details
export interface GroupNotificationDetail {
  memberList?: any[];
  group?: {
    createTime?: number;
  };
  operationTime?: number;
}

export interface ProcessedMessage {
  clientMsgID?: string;
  sendID: string;
  recvID: string;
  groupID?: string;
  content: string;
  sendTime?: number;
  isRead?: boolean;
}

/**
 * Safely parse JSON content
 * @param jsonString - The JSON string to parse
 * @param fallback - Fallback value if parsing fails
 * @returns Parsed object or fallback value
 */
export const safeJsonParse = <T>(jsonString: string | undefined, fallback: T): T => {
  if (!jsonString) return fallback;
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    return fallback;
  }
};

/**
 * Process a single incoming message
 * @param message - The raw message from OpenIM
 * @returns Processed message or null if it should be skipped
 */
export const processIncomingMessage = (message: Message): Message | null => {
  // Check for group creation/notification messages
  if (message.contentType === 1501 && message.notificationElem?.detail) {
    const detail = safeJsonParse<GroupNotificationDetail>(message.notificationElem.detail, {
      memberList: [],
      group: {},
      operationTime: 0
    });

    const members = detail.memberList || [];

    // Skip if this is a group creation with only one member
    if (
      members.length === 1 &&
      detail.group &&
      detail.group.createTime === detail.operationTime
    ) {
      return null; // Skip processing for group creation notifications
    }
  }

  return message;
};

/**
 * Generate conversation ID based on message properties
 * @param message - The message to generate ID for
 * @returns Conversation ID string
 */
export const generateConversationId = (message: Message): string => {
  if (message.groupID) {
    return `sg_${message.groupID}`;
  }
  
  const [smallerUserID, largerUserID] = [message.sendID, message.recvID].sort();
  return `si_${smallerUserID}_${largerUserID}`;
};