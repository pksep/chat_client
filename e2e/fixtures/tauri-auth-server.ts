// Только вымышленные данные; JWT предназначен для локальной проверки таймера.
let generation = 0;
let currentCookie = '';
let unavailable = false;
const events: Array<{
  action: string;
  status: number;
  at: number;
  generation: number;
  expiresAt?: number;
  cookieMatched?: boolean;
}> = [];
const encode = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const user = { id: 'tauri-session-fixture', nickname: 'fixture' };
Bun.serve({
  hostname: '127.0.0.1',
  port: 5207,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const cookie = request.headers.get('cookie') || '';
    if (path === '/__qa/status') return Response.json({ events, generation });
    if (path === '/__qa/mode' && request.method === 'POST') {
      unavailable = (await request.json()).unavailable === true;
      return new Response(null, { status: 204 });
    }
    if (path === '/api/telemetry/events')
      return new Response(null, { status: 204 });
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const action = path.split('/').at(-1) || '';
    const at = Date.now();
    const cookieMatched =
      !!currentCookie &&
      cookie.split(/;\s*/).includes(`chat_refresh_token=${currentCookie}`);
    if (action === 'refresh' && unavailable) {
      events.push({ action, status: 503, at, generation, cookieMatched });
      return Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503 });
    }
    if (path === '/api/auth/credentials-login') {
      const data = await request.json();
      if (data.identifier !== 'fixture' || data.password !== 'fixture')
        return new Response(null, { status: 401 });
    } else if (
      !['/api/auth/refresh', '/api/auth/logout'].includes(path) ||
      !cookieMatched
    ) {
      events.push({ action, status: 401, at, generation, cookieMatched });
      return Response.json({ code: 'CHAT_REFRESH_MISSING' }, { status: 401 });
    }
    if (path === '/api/auth/logout') {
      currentCookie = '';
      events.push({ action, status: 204, at, generation, cookieMatched });
      return new Response(null, {
        status: 204,
        headers: {
          'Set-Cookie':
            'chat_refresh_token=; Path=/api/auth; Max-Age=0; HttpOnly; SameSite=Lax'
        }
      });
    }
    currentCookie = `fixture-${++generation}`;
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 10;
    const token = [
      encode({ alg: 'RS256', typ: 'JWT', kid: 'local-fixture' }),
      encode({ sub: user.id, iat, exp, generation }),
      'local-fixture'
    ].join('.');
    events.push({
      action,
      status: 200,
      at,
      generation,
      expiresAt: exp * 1000,
      cookieMatched
    });
    return Response.json(
      { token, user, expireTimeSeconds: 10 },
      {
        headers: {
          'Set-Cookie': `chat_refresh_token=${currentCookie}; Path=/api/auth; Max-Age=3600; HttpOnly; SameSite=Lax`
        }
      }
    );
  }
});
console.log('Локальный сервер проверки Tauri: 127.0.0.1:5207');
