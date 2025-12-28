import {
  getMessagesByConversationId,
  getIsWebsocketConnecting
} from './useOpenIM';

// Service to handle message loading for specific conversations
export const loadMessagesForConversation = async (conversationId: string) => {
  if (!conversationId) {
    console.warn('No conversationId provided to loadMessagesForConversation');
    return;
  }

  try {
    if (!getIsWebsocketConnecting()) {
      await getMessagesByConversationId(conversationId, '');
      console.log(`Messages loaded for conversation: ${conversationId}`);
    } else {
      console.log(
        `Websocket is connecting, skipping message load for: ${conversationId}`
      );
    }
  } catch (error) {
    console.error(
      `Failed to load messages for conversation ${conversationId}:`,
      error
    );
  }
};
