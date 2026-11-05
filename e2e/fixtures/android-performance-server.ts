import { createServer } from 'node:http';
import type { Socket } from 'node:net';
import { Server } from 'socket.io';

const uuid = (prefix: string, value: number) =>
  `${prefix}-0000-4000-8000-${String(value).padStart(12, '0')}`;

export async function createAndroidPerformanceServer({
  port = 5188,
  topicCount = 12,
  messagesPerTopic = 5000,
  userCount = 4000,
  qrRedirectUrl = ''
} = {}) {
  const origin = `http://127.0.0.1:${port}`;
  const user = {
    id: uuid('29420000', 0),
    initials: 'Тест Android',
    name: 'Тест',
    nickname: '294000',
    avatarUrl: '',
    ex: {},
    lastOnline: new Date().toISOString()
  };
  const users = Array.from({ length: userCount }, (_, index) => ({
    ...user,
    id: uuid('29420000', index),
    initials: index ? `Сотрудник ${index}` : user.initials,
    nickname: String(294000 + index)
  }));
  const histories = new Map<string, any[]>();
  const topics = Array.from({ length: topicCount }, (_, index) => {
    const id = uuid('29400000', index);
    const peer = users[index + 1];
    const messages = Array.from(
      { length: messagesPerTopic },
      (_, messageIndex) => ({
        id: uuid('29410000', index * 100000 + messageIndex),
        topicId: id,
        senderUserId: peer.id,
        senderUser: peer,
        text: `Android ${index}: сообщение ${messageIndex}`,
        type: 'TEXT',
        status: 'READ',
        createdAt: new Date(
          Date.UTC(2026, 8, 1, 0, 0, messageIndex)
        ).toISOString(),
        updatedAt: new Date(
          Date.UTC(2026, 8, 1, 0, 0, messageIndex)
        ).toISOString(),
        media: [],
        reactions: [],
        messageRead: [],
        isReadByMe: true,
        isSystem: false,
        isPin: false
      })
    );
    histories.set(id, messages);
    return {
      id,
      type: 'DM',
      isFavorite: index === 0,
      name: `Android чат ${index}`,
      user: peer,
      users: [user, peer],
      createdAt: messages[0].createdAt,
      updatedAt: messages.at(-1)!.createdAt,
      lastMessage: messages.at(-1),
      info: {
        unreadCount: 0,
        isPin: false,
        isMute: false,
        isMarkedUnread: false
      },
      unreadMessageCount: 0
    };
  });
  const config = {
    CHAT_API_DOMAIN: `${origin}/api`,
    CHAT_WS_DOMAIN: origin,
    CHAT_ERP_URL: origin,
    CHAT_MASTRA_URL: `${origin}/ai`,
    CHAT_PATH_TO_FILE_CDN: origin,
    CHAT_LIVEKIT_URL: origin,
    CHAT_BOT_GATEWAY: origin,
    CHAT_CALL_TOPIC_AUTO_PROMPT_ENABLED: 'false'
  };
  const latency = {
    users: 0,
    topics: 0,
    messages: 0,
    around: 0,
    config: 0,
    favorite: 0
  };
  const requests: {
    method: string;
    path: string;
    at: number;
    bytes?: number;
  }[] = [];
  const connections: { event: string; at: number; payload?: unknown }[] = [];
  const state = {
    lagLatest: false,
    failMessages: false,
    missingFavorite: false,
    favoriteCreatedAt: null as number | null,
    invitePreviewStatus: 404 as 401 | 404
  };
  const server = createServer(async (request, response) => {
    const url = new URL(request.url!, origin);
    response.setHeader(
      'Access-Control-Allow-Origin',
      request.headers.origin || '*'
    );
    response.setHeader(
      'Access-Control-Allow-Headers',
      request.headers['access-control-request-headers'] ||
        'Authorization, Content-Type'
    );
    response.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,PATCH,DELETE,OPTIONS'
    );
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }
    const entry = {
      method: request.method!,
      path: url.pathname + url.search,
      at: Date.now(),
      bytes: 0
    };
    requests.push(entry);
    const json = (value: unknown) => {
      const body = JSON.stringify(value);
      entry.bytes = Buffer.byteLength(body);
      response.setHeader('Content-Type', 'application/json');
      response.end(body);
    };
    const delay = async (key: keyof typeof latency) => {
      if (latency[key])
        await new Promise(resolve => setTimeout(resolve, latency[key]));
    };
    if (url.pathname === '/config') {
      await delay('config');
      response.setHeader('Content-Type', 'text/plain');
      response.end(
        [
          `VITE_CHAT_API_DOMAIN=${config.CHAT_API_DOMAIN}`,
          `VITE_CHAT_WS_DOMAIN=${config.CHAT_WS_DOMAIN}`,
          `VITE_ERP_URL=${config.CHAT_ERP_URL}`,
          `VITE_MASTRA_URL=${config.CHAT_MASTRA_URL}`,
          `VITE_PATH_TO_FILE_CDN=${config.CHAT_PATH_TO_FILE_CDN}`,
          `VITE_LIVEKIT_URL=${config.CHAT_LIVEKIT_URL}`,
          `VITE_BOT_GATEWAY_URL=${config.CHAT_BOT_GATEWAY}`,
          'VITE_CALL_TOPIC_AUTO_PROMPT_ENABLED=false'
        ].join('\n')
      );
      return;
    }
    const pathname = url.pathname.replace(/^\/api/, '');
    if (pathname === '/v2/q' && qrRedirectUrl) {
      const redirect = new URL(qrRedirectUrl);
      redirect.searchParams.set('organization', origin);
      response.writeHead(302, { Location: redirect.toString() }).end();
      return;
    }
    if (pathname === '/users' || pathname === '/users/login-options') {
      await delay('users');
      json({ data: users, total: users.length, page: 1, limit: users.length });
      return;
    }
    if (pathname === '/topics') {
      await delay('topics');
      const scope = url.searchParams.get('scope') || 'all';
      const visibleTopics = (
        state.missingFavorite ? topics.slice(1) : topics
      ).filter(topic => {
        const description = (topic as any).group?.description || '';
        if (
          scope !== 'all' &&
          description.startsWith('sep-chat:call-topic:v1:')
        )
          return false;
        const client = description === 'sep-chat:external-inquiry:v1';
        return scope === 'chats'
          ? !client
          : scope === 'clients'
            ? client
            : true;
      });
      const page = Math.max(1, Number(url.searchParams.get('page') || 1));
      const limit = Math.max(1, Number(url.searchParams.get('limit') || 20));
      json({
        data: visibleTopics.slice((page - 1) * limit, page * limit),
        total: visibleTopics.length,
        page,
        limit,
        ...(url.searchParams.get('includeUnread') === 'true'
          ? {
              unreadTopics: topics.filter(
                topic =>
                  topic.unreadMessageCount > 0 &&
                  !(topic as any).group?.description?.startsWith(
                    'sep-chat:call-topic:v1:'
                  )
              )
            }
          : {}),
        meta: {
          totalItems: visibleTopics.length,
          totalPages: Math.ceil(visibleTopics.length / limit),
          currentPage: page
        }
      });
      return;
    }
    if (
      pathname === '/groups' &&
      request.method === 'POST' &&
      state.missingFavorite
    ) {
      await delay('favorite');
      state.missingFavorite = false;
      state.favoriteCreatedAt = Date.now();
      json({ topicId: topics[0].id });
      return;
    }
    const history = pathname.match(/^\/messages\/topic\/([^/]+)(\/pinned)?$/);
    if (history) {
      await delay('messages');
      if (state.failMessages) {
        response.statusCode = 503;
        json({ message: 'Тестовая недоступность сети' });
        return;
      }
      let messages = histories.get(history[1]) || [];
      if (history[2]) {
        json([]);
        return;
      }
      const limit = Number(url.searchParams.get('limit') || 48);
      const before = url.searchParams.get('lastMessageId');
      const after = url.searchParams.get('afterMessageId');
      if (before)
        messages = messages
          .filter(message => message.id < before)
          .slice(-limit);
      else if (after)
        messages = messages
          .filter(message => message.id > after)
          .slice(0, limit);
      else
        messages = (state.lagLatest ? messages.slice(0, -1) : messages).slice(
          -limit
        );
      json(messages);
      return;
    }
    const around = pathname.match(/^\/messages\/([^/]+)\/around$/);
    if (around) {
      await delay('around');
      const position = Number(around[1].slice(-12));
      const messages =
        histories.get(uuid('29400000', Math.floor(position / 100000))) || [];
      const index = position % 100000;
      json(messages.slice(Math.max(0, index - 39), index + 41));
      return;
    }
    if (pathname.startsWith('/users/backgrounds')) {
      json([]);
      return;
    }
    if (pathname.startsWith('/users/')) {
      json(user);
      return;
    }
    if (pathname === '/sync/token') {
      json({ syncToken: 'chat-294-local-sync' });
      return;
    }
    if (pathname === '/calls/invite-preview') {
      response.statusCode = state.invitePreviewStatus;
      json({ message: 'Test call invite is unavailable' });
      return;
    }
    if (pathname === '/calls/status' && state.callInviteActive) {
      json({
        active: true,
        topicId: topics[0].id,
        startTime: Date.now(),
        roomReady: true,
        participantCount: 2,
        groupMode: true,
        elapsedDurationMs: 0
      });
      return;
    }
    if (pathname === '/calls/invite-livekit-token' && state.callInviteActive) {
      json({
        token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2aWRlbyI6eyJyb29tSm9pbiI6dHJ1ZX19.signature'
      });
      return;
    }
    if (pathname === '/calls/livekit-token' && state.callInviteActive) {
      response.statusCode = 403;
      json({
        message: 'The regular token endpoint must not be used for invites'
      });
      return;
    }
    if (pathname.startsWith('/sync/')) {
      json({ pts: 0, events: [], updates: [], hasMore: false });
      return;
    }
    if (pathname === '/topics/favorites') {
      json(topics[0]);
      return;
    }
    if (pathname.startsWith('/topics/')) {
      json(topics.find(topic => pathname.includes(topic.id)) || {});
      return;
    }
    json([]);
  });
  const httpConnections = new Set<Socket>();
  server.on('connection', connection => {
    httpConnections.add(connection);
    connection.once('close', () => httpConnections.delete(connection));
  });
  const io = new Server(server, { cors: { origin: true, credentials: true } });
  io.on('connection', socket => {
    connections.push({ event: 'connect', at: Date.now() });
    socket.on('disconnect', () =>
      connections.push({ event: 'disconnect', at: Date.now() })
    );
    socket.on('answerCall', (rawPayload, ack) => {
      const payload = (
        typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload
      ) as {
        userId: string;
        roomId: string;
        topicId?: string | null;
      };
      connections.push({ event: 'answerCall', at: Date.now(), payload });

      if (state.callInviteActive) {
        socket.emit('callAnswered', {
          userId: payload.userId,
          roomId: payload.roomId,
          topicId: payload.topicId,
          startTime: Date.now(),
          elapsedDurationMs: 0
        });
      }

      setTimeout(
        () => {
          if (typeof ack === 'function') {
            ack({
              accepted: true,
              roomId: payload.roomId,
              topicId: payload.topicId
            });
          }
        },
        state.callInviteActive ? 50 : 0
      );
    });
    socket.onAny((event, ...args) => {
      if (event === 'answerCall') return;
      const ack = args.at(-1);
      if (typeof ack === 'function') ack({ success: true });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return {
    origin,
    config,
    user,
    users,
    topics,
    histories,
    latency,
    requests,
    connections,
    state,
    io,
    async close() {
      const closing = io.close();
      // Браузер может оставить HTTP или upgrade-соединение после проверок.
      for (const connection of httpConnections) connection.destroy();
      await closing;
    }
  };
}
