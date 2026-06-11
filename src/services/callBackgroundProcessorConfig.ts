export const CALL_BACKGROUND_ASSET_PATHS = {
  tasksVisionFileSet: '/call-background/wasm',
  modelAssetPath: '/call-background/selfie_segmenter.tflite'
} as const;

export const MEDIAPIPE_MULTICLASS_SEGMENTER_MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

export const ZOOM_WORKPLACE_VIRTUAL_BACKGROUND_MASK = {
  foregroundThreshold: 0.65,
  edgeSoftness: 0.25,
  maskBlurRadius: 1
} as const;

export const MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS = {
  foregroundThreshold: 0.55,
  maskBlurRadius: 1,
  maskProfile: 'full-person'
} as const;
