import { describe, expect, mock, test } from 'bun:test';
import type { Reqi } from '@pksep/reqi';
import { ChatUser } from '../src/services/useChatSDK/user';

describe('удаление своего варианта статуса', () => {
  const status = { icon: '💻', text: 'Работаю удалённо' };

  test('отправляет отдельный DELETE и возвращает обновлённый профиль', async () => {
    const user = { id: 'user-1', status, ex: { customStatusPresets: [] } };
    const sendRequest = mock(async () => Response.json(user));
    const api = new ChatUser({ sendRequest } as unknown as Reqi);
    expect(await api.removeUserStatusPreset(status)).toEqual(user);
    expect(sendRequest).toHaveBeenCalledWith('/users/status-presets', {
      request: { method: 'DELETE', body: status },
      parsed: false
    });
  });

  test('не маскирует ошибку удаления', async () => {
    const error = new Error('Нет сети');
    const sendRequest = mock(async () => {
      throw error;
    });
    const api = new ChatUser({ sendRequest } as unknown as Reqi);
    await expect(api.removeUserStatusPreset(status)).rejects.toThrow(
      'Нет сети'
    );
  });
});
