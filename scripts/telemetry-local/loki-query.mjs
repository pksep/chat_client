export async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readLokiEvents(lokiUrl, runId) {
  const url = new URL('/loki/api/v1/query_range', lokiUrl);
  url.searchParams.set(
    'query',
    `{service="chat-server",environment=${JSON.stringify(runId)},log_type="client_telemetry"}`
  );
  url.searchParams.set('start', `${Date.now() - 3_600_000}000000`);
  url.searchParams.set('limit', '5000');
  url.searchParams.set('direction', 'forward');
  const response = await fetchWithTimeout(url);
  if (!response.ok) throw new Error(`Loki query: HTTP ${response.status}`);
  const body = await response.json();
  if (body.status !== 'success' || body.data?.resultType !== 'streams') {
    throw new Error('Loki вернул неожиданный результат запроса');
  }
  return body.data.result
    .flatMap(stream => stream.values.map(([, line]) => JSON.parse(line)))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}
