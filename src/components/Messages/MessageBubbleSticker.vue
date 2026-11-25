<template>
  <div
    class="message-sticker-stack"
    :class="{ 'message-sticker-stack--appearing': animateAppearance }"
    :style="{ '--sticker-width': `${stickerWidth}px` }"
    :data-testid="`${props.dataTestid}-Sticker`"
  >
    <MessageReferenceBlock
      v-if="props.replyMessage || props.forwardUser"
      :reply-message="props.replyMessage"
      :forward-user="props.forwardUser"
      :message-ex="props.messageEx"
      :is-me-sender="props.isMeSender"
      @navigate-message="$emit('navigate-message')"
    />
    <div
      class="message-sticker__image"
      :style="{
        aspectRatio: `${props.sticker.width || 1} / ${props.sticker.height || 1}`
      }"
      :data-sticker-id="props.sticker.id"
      :role="canOpenPack ? 'button' : undefined"
      :tabindex="canOpenPack ? 0 : undefined"
      :aria-label="canOpenPack ? 'Открыть набор стикеров' : undefined"
      :class="{ 'message-sticker__image--interactive': canOpenPack }"
      @click.stop="emit('activate')"
      @keydown.enter.stop.prevent="canOpenPack && emit('activate')"
      @keydown.space.stop.prevent="canOpenPack && emit('activate')"
      @dblclick.stop
    >
      <slot name="quick-reply" />
      <img
        v-if="props.sticker.previewSrc"
        v-show="!imageLoaded"
        :src="props.sticker.previewSrc"
        :alt="props.sticker.label"
        width="220"
        height="220"
        draggable="false"
        decoding="async"
      />
      <img
        v-if="props.sticker.format !== 'webm' && props.sticker.format !== 'tgs'"
        :src="props.sticker.src"
        class="message-sticker__animation"
        :class="{ 'message-sticker__animation--loaded': imageLoaded }"
        :alt="props.sticker.label"
        :aria-hidden="!imageLoaded"
        width="220"
        height="220"
        draggable="false"
        decoding="async"
        loading="lazy"
        @load="imageLoaded = true"
        @error="imageLoaded = false"
      />
      <StickerTgsAnimation
        v-else-if="props.sticker.format === 'tgs'"
        :src="props.sticker.src"
        :label="props.sticker.label"
        :playing="!props.animationsPaused"
        class="message-sticker__animation"
        :class="{ 'message-sticker__animation--loaded': imageLoaded }"
        :aria-hidden="!imageLoaded"
        @load="imageLoaded = true"
        @error="imageLoaded = false"
      />
      <video
        v-else
        :src="props.sticker.src"
        class="message-sticker__animation"
        :class="{ 'message-sticker__animation--loaded': imageLoaded }"
        :aria-label="props.sticker.label"
        width="220"
        height="220"
        :autoplay="!props.animationsPaused"
        ref="stickerVideo"
        muted
        loop
        playsinline
        disablepictureinpicture
        @loadeddata="imageLoaded = true"
        @error="imageLoaded = false"
      />
    </div>
    <div class="message-footer-row">
      <div v-if="props.reactions?.length" class="message-reactions-row">
        <MessageEmojies :reactions="props.reactions" />
      </div>
      <div
        class="message-time message-time--emoji"
        :data-testid="`${props.dataTestid}-Time`"
      >
        <PinIcon
          v-if="props.isPin"
          :data-testid="`${props.dataTestid}-PinIcon`"
          style="width: 15px; height: 15px; margin-right: -2px"
        />
        <span :data-testid="`${props.dataTestid}-TimeText`">{{
          props.time
        }}</span>
        <ErrorIcon
          v-if="showErrorIcon"
          :data-testid="`${props.dataTestid}-ErrorIcon`"
        />
        <MessageStatusIcons
          v-if="props.isMeSender && !showErrorIcon"
          :is-read="props.isRead"
          :message-status="props.messageStatus"
          :data-testid="props.dataTestid"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ChatStickerItem } from '../../utils/stickers';
import type { IMessageBubbleProps } from './interface/interface';
import MessageReferenceBlock from './MessageReferenceBlock.vue';
import MessageEmojies from './MessageEmojies.vue';
import MessageStatusIcons from './MessageStatusIcons.vue';
import PinIcon from '../UI/PinIcon.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import { MessageStatus } from '../../services/useChatSDK/types';
import StickerTgsAnimation from './StickerTgsAnimation.vue';
import { prepareStickerPicker } from '../../services/sticker-catalog';

const props = defineProps<IMessageBubbleProps & { sticker: ChatStickerItem }>();
const stickerVideo = ref<HTMLVideoElement | null>(null);
watch(
  () => props.animationsPaused,
  paused => {
    if (paused) stickerVideo.value?.pause();
    else void stickerVideo.value?.play().catch(() => undefined);
  }
);
const emit = defineEmits(['navigate-message', 'activate']);
const canOpenPack = computed(
  () => !!props.sticker.pack && !props.isSelectionMode
);
const stickerWidth = computed(() =>
  Math.min(
    220,
    props.sticker.width || 512,
    (220 * (props.sticker.width || 512)) / (props.sticker.height || 512)
  )
);
const imageLoaded = ref(false);
watch([imageLoaded, () => props.sticker.pack], ([loaded, pack]) => {
  if (loaded) prepareStickerPicker(pack);
});
watch(
  () => props.sticker.src,
  () => {
    imageLoaded.value = false;
  }
);
const animateAppearance =
  props.isMeSender && props.messageStatus === MessageStatus.Wait;
const showErrorIcon = computed(
  () => props.messageStatus === MessageStatus.NotDelivered
);
</script>

<style scoped>
.message-sticker-stack {
  display: grid;
  gap: 10px;
  width: min(var(--sticker-width, 220px), calc(100vw - 100px));
  background: transparent;
}

.message-sticker-stack--appearing {
  animation: sticker-appear 160ms ease-out both;
}

@keyframes sticker-appear {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .message-sticker-stack--appearing {
    animation: none;
  }
}

.message-sticker__image {
  position: relative;
  aspect-ratio: 1;
  background: transparent;
  display: block;
  width: 100%;
  min-height: 0;
  padding: 0;
  border: 0;
  cursor: default;
}

.message-sticker__image img,
.message-sticker__image video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.message-sticker__image--interactive {
  cursor: pointer;
}
.message-sticker__image--interactive:focus-visible {
  outline: 2px solid var(--border-hover, #9cbeff);
  outline-offset: 3px;
}

.message-sticker__animation {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.message-sticker__animation--loaded {
  opacity: 1;
}
</style>
