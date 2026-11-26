import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ChatSDK } from '../../src/services/useChatSDK';
import { getChatSDK, initializeChat } from '../../src/services/useChat';
import { setConfig } from '../../src/services/useConfig';
import { useTopics } from '../../src/composables/useTopics';
import { navigateToGroup } from '../../src/composables/navigation';
import {
  ensureTauriWindowStateTracking,
  getIsAppActivelyVisible,
  syncTauriWindowState
} from '../../src/services/useAppVisibility';
import { isTopicCurrentlyVisible } from '../../src/services/useNotificationNavigation';

export async function verifyDesktopMessageVisibility(
  report: (data: Record<string, unknown>) => Promise<void>
) {
  const main = getCurrentWindow();
  const topicId = '4e709627-2338-464f-8cda-ec036b41e815';
  const peerId = '7ac41505-41a6-4a16-9099-52c364b24866';
  const config = { CHAT_API_DOMAIN: 'http://127.0.0.1:5213/api' };
  setConfig(config);
  const connect = ChatSDK.prototype.connect;
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  try {
    await initializeChat({
      userId: 'local-preview',
      token: 'local-visibility-fixture',
      apiUrl: config.CHAT_API_DOMAIN,
      wsUrl: 'ws://127.0.0.1:65530'
    });
  } finally {
    ChatSDK.prototype.connect = connect;
  }
  useTopics().setTopics([
    {
      id: topicId,
      type: 'GROUP',
      name: 'Проверка свёрнутого чата',
      info: { unreadCount: 0, isMute: false }
    } as any
  ]);
  navigateToGroup(topicId);
  ensureTauriWindowStateTracking();
  await main.show();
  await main.unminimize();
  await main.setFocus();
  const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const wait = async (
    check: () => Promise<boolean> | boolean,
    message: string
  ) => {
    const deadline = Date.now() + 10_000;
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error(message);
      await pause(30);
    }
  };
  await syncTauriWindowState();
  await report({
    step: 'message-visibility-initial',
    native: await invoke('desktop_window_state'),
    activelyVisible: getIsAppActivelyVisible(),
    documentFocus: document.hasFocus(),
    documentVisibility: document.visibilityState
  });
  await wait(
    () => getIsAppActivelyVisible(),
    'Основное окно не стало активным'
  );
  const send = (text: string) => {
    (getChatSDK() as any).ws.handleWebSocketEvent({
      type: 'newMessage',
      payload: {
        id: crypto.randomUUID(),
        topicId,
        text,
        type: 'TEXT',
        senderUserId: peerId,
        senderUser: { id: peerId, initials: 'Локальная проверка' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'SENT',
        media: [],
        reactions: [],
        messageRead: [],
        isReadByMe: false,
        isSystem: false
      }
    });
  };
  send('Проверка активного чата — уведомления быть не должно');
  await pause(100);
  await main.minimize();
  await wait(() => main.isMinimized(), 'Основное окно не свернулось');
  await syncTauriWindowState();
  const native = await invoke('desktop_window_state');
  await report({
    step: 'message-visibility-minimized',
    native,
    activelyVisible: getIsAppActivelyVisible(),
    topicVisible: isTopicCurrentlyVisible(topicId),
    documentFocus: document.hasFocus(),
    documentVisibility: document.visibilityState
  });
  if (getIsAppActivelyVisible() || isTopicCurrentlyVisible(topicId))
    throw new Error('Свёрнутый чат считается открытым');
  send('Проверка уведомления из последнего топика при свёрнутом чате');
  await pause(900);
  await report({ step: 'message-visibility-delivered', topicId });
  await main.unminimize();
  await main.show();
  await main.setFocus();
  await syncTauriWindowState();
  await wait(
    () => getIsAppActivelyVisible(),
    'Чат не стал активным после восстановления'
  );
  send('После восстановления уведомления снова быть не должно');
  await pause(150);
  await report({ step: 'message-visibility-complete', passed: true, topicId });
}
