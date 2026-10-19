export type StickerPreviewRequest =
  | { type: 'prepare' }
  | {
      type: 'load';
      key: string;
      width: number;
      height: number;
      data: Record<string, unknown>;
    }
  | { type: 'release'; key: string }
  | { type: 'render'; keys: string[]; time: number };

export type StickerPreviewFrame = {
  key: string;
  width: number;
  height: number;
  pixels: ArrayBuffer;
};

export type StickerPreviewResponse =
  | { type: 'frames'; frames: StickerPreviewFrame[]; requested: boolean }
  | { type: 'error'; key: string };
