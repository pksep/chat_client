import { test, expect, spyOn } from 'bun:test';
import { bindIncomingChatEvents } from '../src/services/useChatSDK/incoming-events';

test('changeMessage сохраняет PTS и обрабатывает NEW до DELETE', () => {
  let listener: (...args: any[]) => void = () => {};
  const socket = {
    onAny: (callback: any) => {
      listener = callback;
    },
    offAny: () => {}
  };
  const received: string[] = [];
  const remove = bindIncomingChatEvents(socket as any, event =>
    received.push(`${event.payload.type}:${event.payload.ptsMeta.pts}`)
  );
  try {
    for (let index = 1; index <= 3; index++)
      listener('changeMessage', {
        type: 'NEW',
        data: { id: index },
        ptsMeta: { pts: String(index) }
      });
    listener('changeMessage', {
      type: 'DELETE',
      data: { id: 2 },
      ptsMeta: { pts: '4' }
    });
    expect(received).toEqual(['NEW:1', 'NEW:2', 'NEW:3', 'DELETE:4']);
  } finally {
    remove();
  }
});

test('ошибка одного обработчика не теряет оставшиеся сообщения пачки', () => {
  let listener: (...args: any[]) => void = () => {};
  const socket = {
    onAny: (callback: any) => {
      listener = callback;
    },
    offAny: () => {}
  };
  const received: string[] = [];
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const remove = bindIncomingChatEvents(socket as any, event => {
    if (event.payload.id === 'bad')
      throw new Error('Тестовая ошибка обработчика');
    received.push(event.payload.id);
  });
  try {
    listener('newMessage', { id: 'bad' });
    listener('newMessage', { id: 'next' });
    listener('messageUpdated', { id: 'edited' });
    expect(received).toEqual(['next', 'edited']);
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    remove();
    log.mockRestore();
  }
});

test('1000 входящих сообщений доставляются один раз и перед следующим изменением', () => {
  let listener: (...args: any[]) => void = () => {};
  let subscriptions = 0;
  const socket = {
    onAny: (callback: any) => {
      listener = callback;
      subscriptions++;
    },
    offAny: () => {}
  };
  const received: string[] = [];
  const remove = bindIncomingChatEvents(socket as any, event =>
    received.push(`${event.type}:${event.payload.id}`)
  );
  try {
    for (let index = 0; index < 1000; index++)
      listener('newMessage', { id: index });
    listener('messageUpdated', { id: 999 });
    listener('messageDeleted', { id: 0 });
    expect(subscriptions).toBe(1);
    expect(received).toEqual([
      ...Array.from({ length: 1000 }, (_, index) => `newMessage:${index}`),
      'messageUpdated:999',
      'messageDeleted:0'
    ]);
  } finally {
    remove();
  }
});

test('отключение SDK отменяет отложенные события предыдущей сессии', async () => {
  let listener: (...args: any[]) => void = () => {};
  const socket = {
    onAny: (callback: any) => {
      listener = callback;
    },
    offAny: () => {}
  };
  const received: string[] = [];
  const remove = bindIncomingChatEvents(socket as any, event =>
    received.push(event.payload.id)
  );
  listener('newMessage', { id: 'old-session' });
  remove();
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(received).toEqual([]);
});

test('одиночное сообщение не ждёт следующего события; служебные события не задерживаются', async () => {
  let listener: (...args: any[]) => void = () => {};
  const socket = {
    onAny: (callback: any) => {
      listener = callback;
    },
    offAny: () => {}
  };
  const received: string[] = [];
  const remove = bindIncomingChatEvents(socket as any, event =>
    received.push(event.type)
  );
  try {
    listener('newMessage', { id: 'single' });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(received).toEqual(['newMessage']);
    listener('joined', {});
    listener('left', {});
    listener('unknownEvent', {});
    expect(received).toEqual(['newMessage', 'joinTopic', 'leaveTopic']);
  } finally {
    remove();
  }
});
