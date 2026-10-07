import type { Socket } from 'socket.io-client';
import type { ChatSDK } from '../../src/services/useChatSDK';
import type { ChatWS } from '../../src/services/useChatSDK/ws';

// Управляемый транспорт для проверок меню: production SDK всё равно отправляет socket-команды с ack.
export const installFolderFixtureSocket = (sdk: ChatSDK): void => {
  const socket = {
    connected: true,
    emit(type: string, raw: string, ack: (response: unknown) => void) {
      const { folderId, ...payload } = JSON.parse(raw);
      const method =
        type === 'createChatFolder'
          ? 'POST'
          : type === 'deleteChatFolder'
            ? 'DELETE'
            : 'PATCH';
      const suffix =
        type === 'reorderChatFolders'
          ? '/reorder'
          : folderId
            ? `/${folderId}`
            : '';
      void fetch(`/folder-menu-api/chat-folders${suffix}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(method === 'DELETE' ? {} : { body: JSON.stringify(payload) })
      })
        .then(async response => {
          if (!response.ok) throw new Error('Ошибка тестового сохранения');
          ack({
            success: true,
            data: response.status === 204 ? undefined : await response.json()
          });
        })
        .catch(error => ack({ success: false, error: error.message }));
    }
  } as unknown as Socket;
  (sdk as unknown as { ws: ChatWS }).ws.setSocket(socket);
};
