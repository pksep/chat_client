const origin = 'http://localhost:5173';
const reports: unknown[] = [];
const downloads: string[] = [];
const png = Bun.file(new URL('./sticker-assets/preview.png', import.meta.url));
const text = new TextEncoder().encode(
  'SEP Chat: безопасный локальный тест меню.\n'
);

Bun.serve({
  hostname: '127.0.0.1',
  port: 5210,
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/reports') {
      if (request.method === 'GET')
        return Response.json(
          { reports, downloads, pngSize: png.size, textSize: text.length },
          { headers }
        );
      if (
        request.method === 'POST' &&
        request.headers.get('origin') === origin
      ) {
        reports.push(await request.json());
        return new Response(null, { status: 204, headers });
      }
    }
    if (
      request.method === 'GET' &&
      /^\/media\/object\/menu-[AB]\.(txt|png)$/.test(url.pathname)
    ) {
      if (url.searchParams.has('downloadName'))
        downloads.push(url.searchParams.get('downloadName')!);
      const image = url.pathname.endsWith('.png');
      return new Response(image ? png : text, {
        headers: {
          ...headers,
          'Content-Type': image ? 'image/png' : 'text/plain'
        }
      });
    }
    return new Response(null, { status: 404, headers });
  }
});
console.log('Локальная проверка меню: 127.0.0.1:5210/reports');
