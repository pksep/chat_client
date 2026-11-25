import { createHmac } from 'node:crypto';

// Только локальный LiveKit --dev с вымышленными участниками.
const origin = process.env.LOCAL_CALL_ORIGIN || 'http://localhost:5173';
const reports: unknown[] = [];
const commands = new Map<string, string[]>();
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
const token = (room: string, identity: string) => {
  const now = Math.floor(Date.now() / 1000);
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: 'devkey',
    sub: identity,
    nbf: now - 10,
    exp: now + 3600,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    }
  })}`;
  return `${body}.${createHmac('sha256', 'secret').update(body).digest('base64url')}`;
};
Bun.serve({
  hostname: '127.0.0.1',
  port: 5209,
  async fetch(request) {
    const url = new URL(request.url);
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (url.pathname === '/token' && request.method === 'GET') {
      const room = url.searchParams.get('room') || '';
      const identity = url.searchParams.get('identity') || '';
      if (
        !/^[\w-]{1,128}$/.test(room) ||
        !/^(native|browser)-qa-[\w-]+$/.test(identity)
      )
        return new Response(null, { status: 400, headers });
      return Response.json({ token: token(room, identity) }, { headers });
    }
    const run = url.searchParams.get('run') || 'native';
    if (url.pathname === '/reports') {
      if (request.method === 'GET') return Response.json(reports, { headers });
      if (
        request.method === 'POST' &&
        request.headers.get('origin') === origin
      ) {
        reports.push({
          run,
          at: new Date().toISOString(),
          report: await request.json()
        });
        return new Response(null, { status: 204, headers });
      }
    }
    if (url.pathname === '/commands') {
      if (request.method === 'GET')
        return Response.json(
          { command: commands.get(run)?.shift() || null },
          { headers }
        );
      if (request.method === 'POST') {
        const { command } = await request.json();
        if (
          ![
            'cycle-screen',
            'leave',
            'start',
            'mic-on',
            'mic-off',
            'signal-reconnect',
            'stats'
          ].includes(command)
        )
          return new Response(null, { status: 400, headers });
        const queue = commands.get(run) || [];
        queue.push(command);
        commands.set(run, queue);
        return new Response(null, { status: 204, headers });
      }
    }
    return new Response(null, { status: 404, headers });
  }
});
console.log('Локальная проверка LiveKit: 127.0.0.1:5209');
