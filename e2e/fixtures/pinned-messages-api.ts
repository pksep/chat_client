import type { IMessage } from '../../src/components/interfaces/interfaces';
import type {
  PinComment,
  PinCommentAck,
  PinCommentCommand
} from '../../src/services/pin-comments';

export const pinFixtureId = (index: number) =>
  `01f0a010-7ff7-4e7b-b97b-${String(index).padStart(12, '0')}`;
export const pinFixtureOwner = '01f0a010-7ff7-4e7b-b97b-cfe5c7ab0101';
export const pinFixturePeer = '01f0a010-7ff7-4e7b-b97b-cfe5c7ab0102';
export const pinFixtureTopic = '01f0a010-7ff7-4e7b-b97b-cfe5c7ab0103';
export const makePinFixtureRows = (): IMessage[] => {
  const rows = Array.from({ length: 25 }, (_, index) => ({
    id: pinFixtureId(index),
    topicId: pinFixtureTopic,
    text: `Сообщение ${index}`,
    type: 'TEXT',
    senderUserId: index % 2 ? pinFixtureOwner : pinFixturePeer,
    senderUser: {
      id: index % 2 ? pinFixtureOwner : pinFixturePeer,
      initials: index % 2 ? 'Иванов И.И.' : 'Петров П.П.'
    },
    createdAt: new Date(
      2026,
      10,
      index < 3 ? 12 + index * 2 : 14 + index,
      12,
      10
    ),
    updatedAt: new Date(
      2026,
      10,
      index < 3 ? 12 + index * 2 : 14 + index,
      12,
      10
    ),
    status: 'DELIVERED',
    media: [],
    reactions: [],
    messageRead: [],
    isReadByMe: true,
    isPin: index < 3,
    isPinnedForAll: index < 3,
    isPinnedForMe: index < 3,
    deletedAt: null,
    isPinnedOnlyMe: false
  })) as IMessage[];
  rows[0].text = 'По заказу № 2847: отгрузка 24 ноября к 10:00.';
  rows[1].text =
    'Добрый день, в вашем заказе 120 корпусов К-18, цвет RAL 7035.\nПеред отгрузкой проверьте маркировку.';
  rows[2].text = '';
  rows[2].media = [
    {
      id: pinFixtureId(102),
      type: 'FILE',
      path: '/e2e/fixtures/pinned-report.txt',
      originName: 'IMG_0481.PNG',
      size: 2800000,
      mimeType: 'text/plain'
    }
  ] as any;
  return rows;
};
export function createPinFixtureApi() {
  const rows = makePinFixtureRows();
  let comments: PinComment[] = rows.slice(0, 3).map((message, index) => ({
    id: pinFixtureId(index + 500),
    topicId: pinFixtureTopic,
    messageId: message.id,
    scope: 'ALL',
    authorId: index === 2 ? pinFixturePeer : pinFixtureOwner,
    authorName: 'Иванов И.И.',
    authorAvatarUrl: null,
    text: [
      'Взять этот заказ в первую очередь',
      'Важная инфа для логистического центра',
      'Переслать документ после одобрения'
    ][index],
    revision: '9007199254740993',
    createdAt: new Date(2026, 10, 14, 19, 10).toISOString(),
    updatedAt: new Date(2026, 10, 14, 19, 10).toISOString()
  }));
  const acks = new Map<string, PinCommentAck>();
  const requests: { method: string; path: string; body?: unknown }[] = [];
  const execute = (
    method: string,
    path: string,
    body?: unknown
  ): { status: number; json: unknown } => {
    requests.push({ method, path, body });
    if (path.endsWith('/pin-comments/commands')) {
      const command = body as PinCommentCommand;
      const previous = acks.get(command.commandId);
      if (previous) return { status: 200, json: previous };
      const message = rows.find(row => row.id === command.messageId);
      if (!message || message.deletedAt) return { status: 404, json: {} };
      let commentId =
        command.action === 'PIN' ? crypto.randomUUID() : command.commentId;
      let revision = '1';
      if (command.action === 'PIN') {
        const pinned =
          command.scope === 'ALL'
            ? message.isPinnedForAll
            : message.isPinnedOnlyMe;
        if (Boolean(pinned) !== command.expectedPinned)
          return { status: 409, json: {} };
        message.isPin = true;
        message.isPinnedForMe = true;
        message.isPinnedForAll =
          command.scope === 'ALL' || message.isPinnedForAll;
        message.isPinnedOnlyMe =
          command.scope === 'SELF' && !message.isPinnedForAll;
        comments.push({
          ...comments[0],
          id: commentId,
          messageId: message.id,
          text: command.text.trim(),
          authorId: pinFixtureOwner,
          revision,
          scope: command.scope
        });
      } else {
        const comment = comments.find(value => value.id === command.commentId);
        if (!comment) return { status: 404, json: {} };
        if (comment.authorId !== pinFixtureOwner)
          return { status: 403, json: {} };
        if (comment.revision !== command.expectedRevision)
          return { status: 409, json: {} };
        revision = (BigInt(comment.revision) + BigInt(1)).toString();
        if (command.action === 'DELETE')
          comments = comments.filter(value => value.id !== comment.id);
        else {
          comment.text = command.text.trim();
          comment.revision = revision;
        }
      }
      const ack: PinCommentAck = {
        ...command,
        commentId,
        revision,
        version: 1,
        comments: structuredClone(comments),
        message: structuredClone(message)
      };
      acks.set(command.commandId, ack);
      return { status: 200, json: ack };
    }
    if (path.endsWith('/pin-comments'))
      return { status: 200, json: { version: 1, comments } };
    if (path.endsWith('/pinned'))
      return {
        status: 200,
        json: rows.filter(message => message.isPin && !message.deletedAt)
      };
    if (/\/messages\/topic\/[^/]+$/.test(path) || path.endsWith('/around'))
      return { status: 200, json: rows.filter(message => !message.deletedAt) };
    return { status: 200, json: [] };
  };
  return {
    rows,
    requests,
    execute,
    get comments() {
      return comments;
    }
  };
}
