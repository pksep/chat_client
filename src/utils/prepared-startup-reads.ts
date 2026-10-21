export interface PreparedStartupReads {
  available: boolean;
  apiUrl?: string;
  startedAt?: number;
  reads?: Record<string, unknown>;
}

declare global {
  interface Window {
    __chatNativePreparedReads?: {
      token: string;
      result: Promise<PreparedStartupReads | null>;
    };
  }
}

export const takePreparedStartupRead = async (
  token: string,
  apiUrl: string,
  endpoint: string
): Promise<{ available: boolean; data?: unknown; startedAt?: number }> => {
  const prepared = window.__chatNativePreparedReads;
  if (!prepared || prepared.token !== token) return { available: false };
  const result = await prepared.result;
  if (
    window.__chatNativePreparedReads !== prepared ||
    !result?.available ||
    result.apiUrl !== apiUrl.replace(/\/+$/, '') ||
    !result.startedAt ||
    Date.now() < result.startedAt ||
    Date.now() - result.startedAt >= 10_000 ||
    !result.reads ||
    !Object.prototype.hasOwnProperty.call(result.reads, endpoint)
  )
    return { available: false };
  const data = result.reads[endpoint];
  delete result.reads[endpoint];
  return { available: true, data, startedAt: result.startedAt };
};
