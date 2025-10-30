import { CbEvents, getSDK } from '@openim/wasm-client-sdk';

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

  const clientMsgID = crypto.randomUUID.toString();

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

const getOrGeneratePlatformId = (): number => {
  const key = 'platformId';
  const storedId = sessionStorage.getItem(key);
  if (storedId === null) {
    const newId = Math.floor(Math.random() * 999999) + 1;
    sessionStorage.setItem(key, newId.toString());
    return newId;
  } else {
    return parseInt(storedId, 10);
  }
};

export { IMSDK, setupOpenIM, getOrGeneratePlatformId };
