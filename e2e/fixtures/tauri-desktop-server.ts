// Локальный журнал smoke-проверки настоящего Tauri, без production-данных.
const reports: unknown[] = [];
const origin = 'http://localhost:5173';
Bun.serve({
  hostname: '127.0.0.1',
  port: 5208,
  async fetch(request) {
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (new URL(request.url).pathname !== '/reports')
      return new Response(null, { status: 404, headers });
    if (request.method === 'GET') return Response.json(reports, { headers });
    if (request.method !== 'POST' || request.headers.get('origin') !== origin)
      return new Response(null, { status: 403, headers });
    const report = await request.json();
    reports.push({ receivedAt: new Date().toISOString(), report });
    return new Response(null, { status: 204, headers });
  }
});
console.log('Локальная проверка desktop: 127.0.0.1:5208/reports');
