// Ручной smoke в настоящем WebView2: bun e2e/fixtures/tauri-auth-server.ts
let generation = 0;
let currentCookie = '';
Bun.serve({
  hostname: '127.0.0.1',
  port: 5207,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const cookie = request.headers.get('cookie') || '';
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (path === '/api/auth/credentials-login') {
      const data = await request.json();
      if (data.identifier !== 'fixture' || data.password !== 'fixture')
        return new Response(null, { status: 401 });
    } else if (
      !currentCookie ||
      !cookie.split('; ').includes(`chat_refresh_token=${currentCookie}`)
    ) {
      return new Response(null, { status: 401 });
    }
    if (path === '/api/auth/logout') {
      currentCookie = '';
      return new Response(null, {
        status: 204,
        headers: {
          'Set-Cookie':
            'chat_refresh_token=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax'
        }
      });
    }
    currentCookie = `fixture-${++generation}`;
    return Response.json(
      { token: `fixture-access-${generation}` },
      {
        headers: {
          'Set-Cookie': `chat_refresh_token=${currentCookie}; Path=/api/auth; Max-Age=3600; HttpOnly; SameSite=Lax`
        }
      }
    );
  }
});
console.log('Локальный сервер проверки Tauri: 127.0.0.1:5207');
