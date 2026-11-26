export const AI_DEV_PROXY_PATH = '/__chat-ai';

export function aiDevProxyBase(
  configured: string | undefined,
  target: string | undefined,
  localOrigin: string
): string | undefined {
  if (!configured || !target) return configured;
  try {
    const source = new URL(configured);
    const upstream = new URL(target);
    const local = new URL(localOrigin);
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(local.hostname) ||
      !['http:', 'https:'].includes(local.protocol) ||
      source.origin !== upstream.origin ||
      !['', '/', '/api', '/api/'].includes(source.pathname) ||
      upstream.pathname !== '/' ||
      source.search ||
      source.hash ||
      source.username ||
      source.password ||
      upstream.search ||
      upstream.hash ||
      upstream.username ||
      upstream.password
    )
      return configured;
    return (
      local.origin +
      AI_DEV_PROXY_PATH +
      (source.pathname.replace(/\/+$/, '') === '/api' ? '/api' : '')
    );
  } catch {
    return configured;
  }
}
