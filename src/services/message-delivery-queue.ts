import type { IMessage } from '../components/interfaces/interfaces';

export const createMessageDeliveryQueue = (options: {
  getUserId: () => string | undefined;
  isConnected: () => boolean;
  send: (
    topicId: string,
    messageIds: string[]
  ) => Promise<{ success: boolean }>;
}) => {
  const pending = new Map<string, Set<string>>();
  const confirmed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;
  let disposed = false;
  const key = (topicId: string, messageId: string) => `${topicId}:${messageId}`;
  const schedule = (delay = 50) => {
    if (!disposed && !timer && pending.size && options.isConnected())
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, delay);
  };
  const flush = async () => {
    if (disposed || flushing || !options.isConnected()) return;
    flushing = true;
    let failed = false;
    try {
      for (const [topicId, ids] of pending) {
        const batch = [...ids].slice(0, 250);
        const result = await options.send(topicId, batch);
        if (disposed) return;
        if (!result?.success)
          throw new Error('Доставка не подтверждена сервером');
        batch.forEach(id => {
          ids.delete(id);
          confirmed.add(key(topicId, id));
        });
        if (!ids.size) pending.delete(topicId);
        while (confirmed.size > 10_000)
          confirmed.delete(confirmed.values().next().value!);
      }
    } catch {
      failed = true;
    } finally {
      flushing = false;
      schedule(failed ? 5000 : 50);
    }
  };
  return {
    enqueue(messages: IMessage[]) {
      if (disposed) return;
      const userId = options.getUserId();
      if (!userId) return;
      messages.filter(Boolean).forEach(message => {
        const state = message.deliveryState;
        if (
          !state ||
          message.senderUserId === userId ||
          message.deletedAt ||
          confirmed.has(key(message.topicId, message.id)) ||
          state.delivered.some(receipt => receipt.userId === userId) ||
          state.read.some(receipt => receipt.userId === userId)
        )
          return;
        const ids = pending.get(message.topicId) || new Set<string>();
        ids.add(message.id);
        pending.set(message.topicId, ids);
      });
      schedule();
    },
    resume() {
      disposed = false;
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      timer = undefined;
      pending.clear();
      confirmed.clear();
    }
  };
};
