import { DotLottie } from '@lottiefiles/dotlottie-web';
import wasmUrl from '@lottiefiles/dotlottie-web/dotlottie-player.wasm?url';
import type {
  StickerPreviewFrame,
  StickerPreviewRequest,
  StickerPreviewResponse
} from './sticker-preview-protocol';

DotLottie.setWasmUrl(new URL(wasmUrl, self.location.href).href);

type Preview = {
  player: DotLottie;
  width: number;
  height: number;
  rate: number;
  length: number;
  ready: boolean;
};
const previews = new Map<string, Preview>();
const frames = new Map<string, Uint8Array>();
const maxCacheBytes = 64 * 1024 * 1024;
let cacheBytes = 0;
let prepared = false;

const prepare = () => {
  if (prepared) return;
  prepared = true;
  const player = new DotLottie({
    canvas: { width: 1, height: 1 },
    data: { v: '5.7.4', w: 1, h: 1, fr: 30, ip: 0, op: 1, layers: [] },
    autoplay: false
  });
  player.addEventListener('load', () => player.destroy());
  player.addEventListener('loadError', () => player.destroy());
};

const respond = (
  message: StickerPreviewResponse,
  transfers: ArrayBuffer[] = []
) => self.postMessage(message, { transfer: transfers });

const renderFrame = (
  key: string,
  time: number
): StickerPreviewFrame | undefined => {
  const preview = previews.get(key);
  if (!preview?.ready) return undefined;
  const { player, width, height, rate, length } = preview;
  // Миниатюры движутся постоянно с исходной скоростью, без повторного расчёта циклов.
  const fps = Math.min(30, rate);
  const count = Math.max(1, Math.ceil((length / rate) * fps));
  const index = Math.floor((time / 1000) * fps) % count;
  const cacheKey = `${key}:${index}`;
  let pixels = frames.get(cacheKey);
  if (pixels) {
    frames.delete(cacheKey);
    frames.set(cacheKey, pixels);
  } else {
    player.setFrame(Math.min(length - 1, Math.floor((index * rate) / fps)));
    const buffer = player.buffer;
    if (!buffer || buffer.byteLength !== width * height * 4)
      throw new Error('Не удалось отрисовать миниатюру стикера');
    pixels = buffer.slice();
    frames.set(cacheKey, pixels);
    cacheBytes += pixels.byteLength;
    while (cacheBytes > maxCacheBytes) {
      const oldest = frames.keys().next().value!;
      cacheBytes -= frames.get(oldest)!.byteLength;
      frames.delete(oldest);
    }
  }
  return { key, width, height, pixels: pixels.slice().buffer as ArrayBuffer };
};

const load = (request: Extract<StickerPreviewRequest, { type: 'load' }>) => {
  const { key, width, height, data } = request;
  if (previews.has(key)) return;
  const player = new DotLottie({
    canvas: { width, height },
    data,
    autoplay: false,
    loop: true,
    useFrameInterpolation: false,
    layout: { fit: 'contain', align: [0.5, 0.5] },
    renderConfig: {
      devicePixelRatio: 1,
      quality: 100,
      freezeOnOffscreen: false
    }
  });
  const preview: Preview = {
    player,
    width,
    height,
    rate: Number(data.fr),
    length: Number(data.op) - Number(data.ip || 0),
    ready: false
  };
  previews.set(key, preview);
  const fail = () => {
    if (previews.get(key) !== preview) {
      player.destroy();
      return;
    }
    previews.delete(key);
    player.destroy();
    respond({ type: 'error', key });
  };
  player.addEventListener('loadError', fail);
  player.addEventListener('renderError', fail);
  const ready = () => {
    player.removeEventListener('load', ready);
    if (previews.get(key) !== preview) {
      player.destroy();
      return;
    }
    if (!(preview.rate > 0) || !(preview.length > 0)) {
      fail();
      return;
    }
    preview.ready = true;
    try {
      const frame = renderFrame(key, 0);
      if (frame)
        respond({ type: 'frames', frames: [frame], requested: false }, [
          frame.pixels
        ]);
    } catch {
      fail();
    }
  };
  player.addEventListener('load', ready);
};

self.addEventListener(
  'message',
  (event: MessageEvent<StickerPreviewRequest>) => {
    const request = event.data;
    if (request.type === 'prepare') {
      prepare();
    } else if (request.type === 'release') {
      const preview = previews.get(request.key);
      previews.delete(request.key);
      if (preview?.ready) preview.player.destroy();
    } else if (request.type === 'load') {
      try {
        load(request);
      } catch {
        respond({ type: 'error', key: request.key });
      }
    } else {
      const rendered: StickerPreviewFrame[] = [];
      for (const key of request.keys) {
        try {
          const frame = renderFrame(key, request.time);
          if (frame) rendered.push(frame);
        } catch {
          respond({ type: 'error', key });
        }
      }
      respond(
        { type: 'frames', frames: rendered, requested: true },
        rendered.map(frame => frame.pixels)
      );
    }
  }
);
