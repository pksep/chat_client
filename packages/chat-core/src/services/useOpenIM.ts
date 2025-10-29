import { CbEvents, getSDK } from '@openim/wasm-client-sdk';
import { v4 as uuidv4 } from 'uuid';

const IMSDK = getSDK();

const setupOpenIM = (): void => {
  IMSDK.on(CbEvents.OnConnecting, () => {
    console.debug('[OpenIM] Connecting...');
  });

  IMSDK.on(CbEvents.OnConnectSuccess, () => {
    console.debug('[OpenIM] Connected successfully!');
  });

  IMSDK.on(CbEvents.OnConnectFailed, err => {
    console.error('[OpenIM] Connection failed:', err);
  });
};

export const sendMessageIM = async (
  to: string,
  message: string,
  groupId: string
): Promise<void> => {
  if (!IMSDK) {
    throw new Error('OpenIM SDK not initialized');
  }

  const clientMsgID = uuidv4();

  try {
    // Create text message (await the Promise to get MessageItem)
    const createResponse = await IMSDK.createTextMessage(message);
    const textMessage = createResponse.data;
    textMessage.clientMsgID = clientMsgID;

    // Send message with SendMsgParams
    await IMSDK.sendMessage({
      message: textMessage,
      recvID: to,
      groupID: groupId
    });
    console.debug('[OpenIM] Message sent successfully to:', to);
  } catch (error) {
    console.error('[OpenIM] Failed to send message:', error);
    throw error;
  }
};

export { IMSDK, setupOpenIM };
