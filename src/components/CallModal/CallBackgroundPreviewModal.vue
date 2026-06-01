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
        <div class="call-background-preview__surface">
          <video
            ref="previewVideoRef"
            class="call-background-preview__video"
            autoplay
            muted
            playsinline
          ></video>
          <div
            v-if="isLoading || previewError"
            class="call-background-preview__overlay"
          >
            <p v-if="previewError">{{ previewError }}</p>
            <p v-else>Подключаем камеру...</p>
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
          Отменить
        </Button>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          class="call-background-preview__apply"
          :disabled="disabled || isApplying"
          @click="$emit('apply')"
        >
          {{ isApplying ? 'Сохраняем...' : 'Применить' }}
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
        <div class="call-background-preview__surface">
          <video
            ref="previewVideoRef"
            class="call-background-preview__video"
            autoplay
            muted
            playsinline
          ></video>
          <div
            v-if="isLoading || previewError"
            class="call-background-preview__overlay"
          >
            <p v-if="previewError">{{ previewError }}</p>
            <p v-else>Подключаем камеру...</p>
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
          {{ isApplying ? 'Сохраняем...' : 'Применить' }}
        </Button>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import {
  BackgroundProcessor,
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useCallBackground } from '../../composables/useCallBackground';
import { prewarmCallBackgroundAssets } from '../../services/callBackgroundWarmup';
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

const CALL_BACKGROUND_ASSET_PATHS = {
  tasksVisionFileSet: '/call-background/wasm',
  modelAssetPath: '/call-background/selfie_segmenter.tflite'
};
const previewVideoRef = ref<HTMLVideoElement | null>(null);
const isLoading = ref(false);
const previewError = ref('');
const activePreviewTrack = ref<LocalVideoTrack | null>(null);
let previewSessionId = 0;

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

const stopPreview = async (): Promise<void> => {
  const track = activePreviewTrack.value;
  activePreviewTrack.value = null;
  isLoading.value = false;

  if (previewVideoRef.value) {
    previewVideoRef.value.srcObject = null;
  }

  if (!track) {
    return;
  }

  try {
    if (previewVideoRef.value) {
      track.detach(previewVideoRef.value);
    } else {
      track.detach();
    }
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

const startPreview = async (): Promise<void> => {
  if (!props.open) {
    return;
  }

  const currentSessionId = ++previewSessionId;
  await stopPreview();
  previewError.value = '';
  isLoading.value = true;

  try {
    void prewarmCallBackgroundAssets(previewSelection.value.imageUrl);

    const track = await createLocalVideoTrack({
      facingMode: 'user',
      frameRate: 20,
      resolution: VideoPresets.h360.resolution
    });

    if (previewSelection.value.mode !== 'none') {
      if (!supportsBackgroundProcessors()) {
        throw new Error(
          'Виртуальный фон камеры не поддерживается в этом браузере'
        );
      }

      const processor =
        previewSelection.value.mode === 'blur'
          ? BackgroundProcessor(
              {
                mode: 'background-blur',
                blurRadius: 12,
                assetPaths: CALL_BACKGROUND_ASSET_PATHS
              },
              'call-background-preview-processor'
            )
          : BackgroundProcessor(
              {
                mode: 'virtual-background',
                imagePath: previewSelection.value.imageUrl || '',
                assetPaths: CALL_BACKGROUND_ASSET_PATHS
              },
              'call-background-preview-processor'
            );

      await track.setProcessor(processor);
    }

    if (currentSessionId !== previewSessionId) {
      track.stop();
      return;
    }

    activePreviewTrack.value = track;
    if (previewVideoRef.value) {
      track.attach(previewVideoRef.value);
    }
  } catch (error) {
    console.warn('Failed to start call background preview:', error);
    previewError.value =
      error instanceof Error && error.message
        ? error.message
        : 'Не получилось включить камеру для предпросмотра';
  } finally {
    if (currentSessionId === previewSessionId) {
      isLoading.value = false;
    }
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
      await stopPreview();
      return;
    }

    await startPreview();
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  void stopPreview();
});
</script>
