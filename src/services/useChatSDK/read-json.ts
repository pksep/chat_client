import type { Reqi } from '@pksep/reqi';
import { withNetworkTimeout } from '../../utils/network-timeout';

interface PendingReads {
  requests: Map<string, Promise<unknown>>;
  getScope: () => string | undefined;
  scope?: string;
}

const pendingReads = new WeakMap<Reqi, PendingReads>();

export const configureJsonReads = (
  reqi: Reqi,
  getScope: () => string | undefined = () => undefined
): void => {
  if (pendingReads.has(reqi)) return;
  const state: PendingReads = { requests: new Map(), getScope };
  pendingReads.set(reqi, state);

  const sendRequest = reqi.sendRequest.bind(reqi);
  reqi.sendRequest = ((...args: Parameters<Reqi['sendRequest']>) => {
    const method = (args[1]?.request?.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') return sendRequest(...args);

    // Чтение после изменения не должно присоединяться к старому ответу.
    state.requests.clear();
    return sendRequest(...args).finally(() => state.requests.clear());
  }) as Reqi['sendRequest'];
};

export const readJson = <T>(
  reqi: Reqi,
  endpoint: string,
  options?: { reusePending?: boolean; timeoutMs?: number }
): Promise<T> => {
  configureJsonReads(reqi);
  const state = pendingReads.get(reqi)!;
  const scope = state.getScope();
  if (scope !== state.scope) {
    state.requests.clear();
    state.scope = scope;
  }
  const pending = state.requests.get(endpoint);
  if (pending && options?.reusePending !== false) return pending as Promise<T>;

  const request = withNetworkTimeout(async signal => {
    const response = await reqi.get(endpoint, {
      parsed: false,
      request: { signal }
    });
    return (await response.json()) as T;
  }, options?.timeoutMs ?? 10_000).finally(() => {
    if (state.requests.get(endpoint) === request) {
      state.requests.delete(endpoint);
    }
  });
  state.requests.set(endpoint, request);
  return request;
};
