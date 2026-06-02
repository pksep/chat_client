<template>
  <MobileModal
    v-if="isMobile"
    class="call-background-preview"
    headerClass="hidden"
    :show-divider="false"
    :open="open"
    @unmount-close="$emit('close')"
  >
    <div
      class="call-background-preview__modal call-background-preview__modal--mobile"
    >
      <div class="call-background-preview__frame">
        <div
          v-if="showTensorflowPreview"
          class="call-background-preview__surface"
        >
          <canvas
            ref="tensorflowPreviewCanvasRef"
            class="call-background-preview__video call-background-preview__canvas"
          ></canvas>
          <div
            v-if="isTensorflowLoading || tensorflowPreviewError"
            class="call-background-preview__overlay"
          >
            <p v-if="tensorflowPreviewError">{{ tensorflowPreviewError }}</p>
            <p v-else>Loading MediaPipe preview...</p>
          </div>
        </div>

        <div v-else class="call-background-preview__surface">
          <video
            ref="singlePreviewVideoRef"
            class="call-background-preview__video"
            autoplay
            muted
            playsinline
          ></video>
          <div
            v-if="isLiveKitLoading || liveKitPreviewError"
            class="call-background-preview__overlay"
          >
            <p v-if="liveKitPreviewError">{{ liveKitPreviewError }}</p>
            <p v-else>Connecting camera...</p>
          </div>
        </div>
      </div>

      <div class="call-background-preview__actions">
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.small"
          class="call-background-preview__cancel"
          @click="$emit('close')"
        >
          Cancel
        </Button>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          class="call-background-preview__apply"
          :disabled="disabled || isApplying"
          @click="$emit('apply')"
        >
          {{ isApplying ? 'Saving...' : 'Apply' }}
        </Button>
      </div>
    </div>
  </MobileModal>

  <Modal
    v-else
    :open="open"
    class="call-background-preview__desktop-modal"
    position="center"
    width="760px"
    @close="$emit('close')"
  >
    <div
      class="call-background-preview__modal call-background-preview__modal--desktop"
    >
      <div class="call-background-preview__header">
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.little"
          class="call-background-preview__close"
          @click="$emit('close')"
        >
          <Icon :name="IconNameEnum.crossSmall" :width="24" :height="24" />
        </Button>
      </div>

      <div class="call-background-preview__frame">
        <div
          v-if="showTensorflowPreview"
          class="call-background-preview__surface"
        >
          <canvas
            ref="tensorflowPreviewCanvasRef"
            class="call-background-preview__video call-background-preview__canvas"
          ></canvas>
          <div
            v-if="isTensorflowLoading || tensorflowPreviewError"
            class="call-background-preview__overlay"
          >
            <p v-if="tensorflowPreviewError">{{ tensorflowPreviewError }}</p>
            <p v-else>Loading MediaPipe preview...</p>
          </div>
        </div>

        <div v-else class="call-background-preview__surface">
          <video
            ref="singlePreviewVideoRef"
            class="call-background-preview__video"
            autoplay
            muted
            playsinline
          ></video>
          <div
            v-if="isLiveKitLoading || liveKitPreviewError"
            class="call-background-preview__overlay"
          >
            <p v-if="liveKitPreviewError">{{ liveKitPreviewError }}</p>
            <p v-else>Connecting camera...</p>
          </div>
        </div>
      </div>

      <div class="call-background-preview__actions">
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          class="call-background-preview__apply"
          :disabled="disabled || isApplying"
          @click="$emit('apply')"
        >
          {{ isApplying ? 'Saving...' : 'Apply' }}
        </Button>
      </div>
    </div>
  </Modal>

  <video
    ref="tensorflowSourceVideoRef"
    class="call-background-preview__hidden-video"
    autoplay
    muted
    playsinline
  ></video>
</template>

<script setup lang="ts">
import {
  BackgroundProcessor as LiveKitBackgroundProcessor,
  supportsBackgroundProcessors
} from '@livekit/track-processors';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum
} from '@pksep/yui';
import {
  createLocalVideoTrack,
  LocalVideoTrack,
  VideoPresets
} from 'livekit-client';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useCallBackground } from '../../composables/useCallBackground';
import {
  CALL_BACKGROUND_ASSET_PATHS,
  MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS
} from '../../services/callBackgroundProcessorConfig';
import { prewarmCallBackgroundAssets } from '../../services/callBackgroundWarmup';
import {
  createMediapipeMulticlassBackgroundPreview,
  type MediapipeMulticlassBackgroundPreviewController
} from '../../services/mediapipeMulticlassBackgroundPreview';
import MobileModal from '../UI/MobileModal.vue';

const props = defineProps<{
  open: boolean;
  isMobile: boolean;
  isApplying: boolean;
  disabled: boolean;
  pendingSelectionId: string;
  pendingDataUrl: string;
}>();

defineEmits<{
  (e: 'close'): void;
  (e: 'apply'): void;
}>();

const { getCallBackgroundOptionById } = useCallBackground();

const PREVIEW_TRACK_SETTINGS = {
  frameRate: 24,
  resolution: VideoPresets.h720.resolution,
  delegate: 'GPU' as const,
  maxFps: 30
};

const singlePreviewVideoRef = ref<HTMLVideoElement | null>(null);
const tensorflowPreviewCanvasRef = ref<HTMLCanvasElement | null>(null);
const tensorflowSourceVideoRef = ref<HTMLVideoElement | null>(null);
const isLiveKitLoading = ref(false);
const isTensorflowLoading = ref(false);
const liveKitPreviewError = ref('');
const tensorflowPreviewError = ref('');
const activePreviewTrack = ref<LocalVideoTrack | null>(null);
const sourcePreviewTrack = ref<LocalVideoTrack | null>(null);
let previewSessionId = 0;
let activeTensorflowPreviewController: MediapipeMulticlassBackgroundPreviewController | null =
  null;

const previewSelection = computed(() => {
  if (props.pendingDataUrl) {
    return {
      mode: 'image' as const,
      imageUrl: props.pendingDataUrl
    };
  }

  const option = getCallBackgroundOptionById(props.pendingSelectionId);

  return {
    mode: option?.mode || 'none',
    imageUrl: option?.mode === 'image' ? option.imageUrl : null
  };
});

const showTensorflowPreview = computed(
  () => previewSelection.value.mode === 'image'
);

const waitForVideoReady = async (video: HTMLVideoElement): Promise<void> => {
  if (
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const handleLoadedData = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Could not initialize the preview camera stream'));
    };
    const cleanup = () => {
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('loadeddata', handleLoadedData, { once: true });
    video.addEventListener('error', handleError, { once: true });
  });
};

const stopTrack = async (
  track: LocalVideoTrack | null | undefined
): Promise<void> => {
  if (!track) {
    return;
  }

  try {
    track.detach();
  } catch {
    //
  }

  try {
    if (track.getProcessor()) {
      await track.stopProcessor();
    }
  } catch (error) {
    console.warn('Failed to stop call background preview processor:', error);
  }

  track.stop();
};

const stopPreview = async (): Promise<void> => {
  const track = activePreviewTrack.value;
  const sourceTrack = sourcePreviewTrack.value;
  const tensorflowPreviewController = activeTensorflowPreviewController;

  activePreviewTrack.value = null;
  sourcePreviewTrack.value = null;
  activeTensorflowPreviewController = null;
  isLiveKitLoading.value = false;
  isTensorflowLoading.value = false;

  if (singlePreviewVideoRef.value) {
    singlePreviewVideoRef.value.srcObject = null;
  }
  if (tensorflowSourceVideoRef.value) {
    tensorflowSourceVideoRef.value.srcObject = null;
  }

  tensorflowPreviewController?.stop();

  await Promise.all([stopTrack(track), stopTrack(sourceTrack)]);
};

const startSinglePreview = async (currentSessionId: number): Promise<void> => {
  isLiveKitLoading.value = true;

  try {
    const track = await createLocalVideoTrack({
      facingMode: 'user',
      frameRate: PREVIEW_TRACK_SETTINGS.frameRate,
      resolution: PREVIEW_TRACK_SETTINGS.resolution
    });

    if (previewSelection.value.mode !== 'none') {
      if (!supportsBackgroundProcessors()) {
        throw new Error(
          'Virtual camera background is not supported in this browser'
        );
      }

      const processor =
        previewSelection.value.mode === 'blur'
          ? LiveKitBackgroundProcessor(
              {
                mode: 'background-blur',
                blurRadius: 12,
                assetPaths: CALL_BACKGROUND_ASSET_PATHS,
                maxFps: PREVIEW_TRACK_SETTINGS.maxFps
              },
              'call-background-preview-single'
            )
          : LiveKitBackgroundProcessor(
              {
                mode: 'virtual-background',
                imagePath: previewSelection.value.imageUrl || '',
                assetPaths: CALL_BACKGROUND_ASSET_PATHS,
                segmenterOptions: {
                  delegate: PREVIEW_TRACK_SETTINGS.delegate
                },
                maxFps: PREVIEW_TRACK_SETTINGS.maxFps
              },
              'call-background-preview-single'
            );

      await track.setProcessor(processor);
    }

    if (currentSessionId !== previewSessionId) {
      await stopTrack(track);
      return;
    }

    activePreviewTrack.value = track;
    if (singlePreviewVideoRef.value) {
      track.attach(singlePreviewVideoRef.value);
    }

    isLiveKitLoading.value = false;
  } catch (error) {
    console.warn('Failed to start call background preview:', error);
    liveKitPreviewError.value =
      error instanceof Error && error.message
        ? error.message
        : 'Could not enable the camera preview';
    isLiveKitLoading.value = false;
  }
};

const startTensorflowPreview = async (
  currentSessionId: number
): Promise<void> => {
  const sourceVideo = tensorflowSourceVideoRef.value;
  const tensorflowCanvas = tensorflowPreviewCanvasRef.value;

  if (!sourceVideo || !tensorflowCanvas) {
    throw new Error('MediaPipe preview is not ready yet');
  }

  isTensorflowLoading.value = true;

  const sourceTrack = await createLocalVideoTrack({
    facingMode: 'user',
    frameRate: PREVIEW_TRACK_SETTINGS.frameRate,
    resolution: PREVIEW_TRACK_SETTINGS.resolution
  });

  if (currentSessionId !== previewSessionId) {
    await stopTrack(sourceTrack);
    return;
  }

  sourcePreviewTrack.value = sourceTrack;
  sourceTrack.attach(sourceVideo);

  try {
    await sourceVideo.play();
  } catch {
    //
  }

  await waitForVideoReady(sourceVideo);
  sourceVideo.width = sourceVideo.videoWidth;
  sourceVideo.height = sourceVideo.videoHeight;

  try {
    const tensorflowPreviewController =
      await createMediapipeMulticlassBackgroundPreview({
        backgroundImageUrl: previewSelection.value.imageUrl || '',
        edgeBlurAmount: MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS.maskBlurRadius,
        foregroundThreshold:
          MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS.foregroundThreshold,
        maskProfile: MULTICLASS_VIRTUAL_BACKGROUND_DEFAULTS.maskProfile,
        onError: message => {
          tensorflowPreviewError.value = message;
          isTensorflowLoading.value = false;
        },
        outputCanvas: tensorflowCanvas,
        sourceVideo
      });

    if (currentSessionId !== previewSessionId) {
      tensorflowPreviewController.stop();
      return;
    }

    activeTensorflowPreviewController = tensorflowPreviewController;
    isTensorflowLoading.value = false;
  } catch (error) {
    console.warn('Failed to start MediaPipe preview:', error);
    tensorflowPreviewError.value =
      error instanceof Error && error.message
        ? error.message
        : 'Could not start MediaPipe preview';
    isTensorflowLoading.value = false;
  }
};

const startPreview = async (): Promise<void> => {
  if (!props.open) {
    return;
  }

  await nextTick();

  const currentSessionId = ++previewSessionId;
  await stopPreview();
  liveKitPreviewError.value = '';
  tensorflowPreviewError.value = '';

  try {
    void prewarmCallBackgroundAssets(previewSelection.value.imageUrl);
    if (showTensorflowPreview.value) {
      await startTensorflowPreview(currentSessionId);
      return;
    }

    await startSinglePreview(currentSessionId);
  } catch (error) {
    console.warn('Failed to start call background preview:', error);
    liveKitPreviewError.value =
      error instanceof Error && error.message
        ? error.message
        : 'Could not enable the camera preview';
  }
};

watch(
  () => [
    props.open,
    previewSelection.value.mode,
    previewSelection.value.imageUrl
  ],
  async ([isOpen]) => {
    if (!isOpen) {
      previewSessionId += 1;
      await stopPreview();
      return;
    }

    await startPreview();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  previewSessionId += 1;
  void stopPreview();
});
</script>
