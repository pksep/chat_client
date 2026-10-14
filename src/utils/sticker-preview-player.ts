import PreviewWorker from './sticker-preview.worker?worker';
import { loadTgsAnimation } from './tgs-animation';
import type {
  StickerPreviewRequest,
  StickerPreviewResponse
} from './sticker-preview-protocol';

type Client = {
  key: string;
  context: CanvasRenderingContext2D;
  playing: boolean;
  loaded: boolean;
  disposed: boolean;
  timeout: ReturnType<typeof setTimeout>;
  onLoad: () => void;
  onError: () => void;
};
type Slot = {
  id: number;
  worker: Worker;
  clients: Set<Client>;
  pending: boolean;
  timeout?: ReturnType<typeof setTimeout>;
  idle?: ReturnType<typeof setTimeout>;
};
const slots = new Map<number, Slot>();
let raf = 0;
let lastFrame = -1;

const send = (slot: Slot, request: StickerPreviewRequest) =>
  slot.worker.postMessage(request);

const disposeClient = (slot: Slot, client: Client) => {
  if (client.disposed) return;
  client.disposed = true;
  clearTimeout(client.timeout);
  slot.clients.delete(client);
  if (slots.get(slot.id) === slot) {
    if (![...slot.clients].some(item => item.key === client.key))
      send(slot, { type: 'release', key: client.key });
    if (!slot.clients.size)
      slot.idle = setTimeout(() => failSlot(slot.id, slot), 5000);
  }
  if (![...slots.values()].some(item => item.clients.size)) {
    cancelAnimationFrame(raf);
    raf = 0;
    document.removeEventListener('visibilitychange', schedule);
  }
};

const failClient = (slot: Slot, client: Client) => {
  if (client.disposed) return;
  disposeClient(slot, client);
  client.onError();
};

const failSlot = (id: number, slot: Slot) => {
  if (slots.get(id) !== slot) return;
  slots.delete(id);
  clearTimeout(slot.timeout);
  clearTimeout(slot.idle);
  slot.worker.terminate();
  for (const client of slot.clients) failClient(slot, client);
};

const tick = (time: number) => {
  raf = 0;
  if (document.hidden) return;
  let playing = false;
  const frame = Math.floor((time * 30) / 1000);
  for (const [id, slot] of slots) {
    const keys = [
      ...new Set(
        [...slot.clients]
          .filter(
            client => (client.playing || !client.loaded) && !client.disposed
          )
          .map(client => client.key)
      )
    ];
    if (!keys.length) continue;
    playing = true;
    if (slot.pending || frame === lastFrame) continue;
    slot.pending = true;
    slot.timeout = setTimeout(() => failSlot(id, slot), 5000);
    send(slot, { type: 'render', keys, time });
  }
  lastFrame = frame;
  if (playing) raf = requestAnimationFrame(tick);
};
const schedule = () => {
  if (!raf && !document.hidden) raf = requestAnimationFrame(tick);
};

const createSlot = (id: number): Slot => {
  const slot: Slot = {
    id,
    worker: new PreviewWorker(),
    clients: new Set(),
    pending: false
  };
  slot.worker.addEventListener('error', () => failSlot(id, slot));
  slot.worker.addEventListener('messageerror', () => failSlot(id, slot));
  slot.worker.addEventListener(
    'message',
    (event: MessageEvent<StickerPreviewResponse>) => {
      if (slots.get(id) !== slot) return;
      const response = event.data;
      if (response.type === 'error') {
        for (const client of slot.clients)
          if (client.key === response.key) failClient(slot, client);
        return;
      }
      if (response.requested) {
        slot.pending = false;
        clearTimeout(slot.timeout);
      }
      for (const frame of response.frames) {
        const image = new ImageData(
          new Uint8ClampedArray(frame.pixels),
          frame.width,
          frame.height
        );
        for (const client of slot.clients) {
          if (client.key !== frame.key || client.disposed) continue;
          if (!client.playing && client.loaded) continue;
          client.context.putImageData(image, 0, 0);
          if (!client.loaded) {
            client.loaded = true;
            clearTimeout(client.timeout);
            client.onLoad();
          }
        }
      }
    }
  );
  slots.set(id, slot);
  return slot;
};

export const prepareStickerPreviews = () => {
  if (document.hidden) return;
  for (const id of [0, 1]) {
    const slot = slots.get(id) || createSlot(id);
    send(slot, { type: 'prepare' });
    if (!slot.clients.size) {
      clearTimeout(slot.idle);
      slot.idle = setTimeout(() => failSlot(id, slot), 5000);
    }
  }
};

export const createStickerPreviewPlayer = async (
  canvas: HTMLCanvasElement,
  src: string,
  playing: boolean,
  onLoad: () => void,
  onError: () => void,
  signal?: AbortSignal
) => {
  signal?.throwIfAborted();
  const data = await loadTgsAnimation(src);
  signal?.throwIfAborted();
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Не удалось создать миниатюру стикера');
  const bounds = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(bounds.width * dpr));
  canvas.height = Math.max(1, Math.round(bounds.height * dpr));
  const key = `${src}:${canvas.width}x${canvas.height}`;
  let hash = 0;
  for (const char of src) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const id = Math.abs(hash % 2);
  const slot = slots.get(id) || createSlot(id);
  clearTimeout(slot.idle);
  const client: Client = {
    key,
    context,
    playing,
    loaded: false,
    disposed: false,
    timeout: setTimeout(() => failClient(slot, client), 15000),
    onLoad,
    onError
  };
  const first = ![...slot.clients].some(item => item.key === key);
  slot.clients.add(client);
  if (first)
    send(slot, {
      type: 'load',
      key,
      width: canvas.width,
      height: canvas.height,
      data
    });
  if (
    [...slots.values()].reduce((sum, item) => sum + item.clients.size, 0) === 1
  )
    document.addEventListener('visibilitychange', schedule);
  schedule();

  return {
    setPlaying(value: boolean) {
      client.playing = value;
      if (value) schedule();
    },
    destroy() {
      disposeClient(slot, client);
    }
  };
};
