<template>
  <div
    ref="panel"
    class="call-modal__group-layout"
    :class="{ 'call-modal__participants-panel--grid': !focusedParticipant }"
  >
    <ScreenShareParticipantsStrip
      v-if="!!focusedParticipant"
      :participants="participants"
      :focused-participant="focusedParticipant"
      :set-remote-video-ref="setRemoteVideoRef"
      @select-participant="emit('select-participant', $event)"
    />
    <div
      v-else
      class="call-modal__remote-grid"
      @touchstart.passive="handleTouchStart"
      @touchmove="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="cancelSwipe"
      @click.capture="suppressSwipeClick"
      :class="{
        'call-modal__remote-grid--single': currentPageParticipantCount === 1,
        'call-modal__remote-grid--duo': currentPageParticipantCount === 2,
        'call-modal__remote-grid--group-duo': currentPageParticipantCount === 2,
        'call-modal__remote-grid--trio': currentPageParticipantCount === 3,
        'call-modal__remote-grid--quad':
          currentPageParticipantCount >= 3 && currentPageParticipantCount <= 4,
        'call-modal__remote-grid--six':
          currentPageParticipantCount >= 5 && currentPageParticipantCount <= 6,
        'call-modal__remote-grid--many': currentPageParticipantCount >= 7
      }"
    >
      <div
        v-for="participant in participants"
        :key="participant.tileId"
        class="call-modal__remote-tile"
        :class="{
          'call-modal__remote-tile--local': participant.isLocal,
          'call-modal__remote-tile--speaking': participant.isSpeaking
        }"
        @click="emit('select-participant', participant.tileId)"
      >
        <video
          v-show="participant.isVideoActive"
          :ref="el => setRemoteVideoRef(participant.tileId, el as Element)"
          autoplay
          playsinline
          class="call-modal__remote-video"
        ></video>
        <ReactionVideoOverlay
          v-if="participant.activeReactionVideoSrc"
          :src="participant.activeReactionVideoSrc"
          :video-key="participant.activeReactionVideoKey"
          class-name="call-modal__remote-reaction-video"
        />
        <div
          v-if="!participant.isVideoActive"
          class="call-modal__remote-placeholder"
          :class="{
            'call-modal__remote-placeholder--background':
              !!participant.backgroundPlaceholderStyle
          }"
          :style="participant.backgroundPlaceholderStyle || undefined"
        >
          <CachedAvatar
            v-if="!participant.backgroundPlaceholderStyle"
            :path="participant.avatarUrl"
            :alt="participant.name"
            class="call-modal__avatar"
            :initials="participant.initials"
          />
        </div>
        <div
          v-if="participant.isHandRaised"
          class="call-modal__remote-hand"
          :title="`${participant.name} raised a hand`"
        >
          <HandRaiseIcon />
        </div>
        <ConnectionQualityIndicator :quality="participant.connectionQuality" />
        <div class="call-modal__remote-name">
          <span :title="participant.name">{{ participant.name }}</span>
          <MicIcon
            v-if="participant.isMicActive"
            :audio-level="participant.audioLevel"
            :is-speaking="participant.isSpeaking"
          />
          <MicDisableIcon v-else />
        </div>
      </div>
    </div>
    <div
      v-if="totalPages > 1 && !focusedParticipant"
      class="call-modal__pagination"
    >
      <button
        class="call-modal__pagination-arrow"
        type="button"
        aria-label="Предыдущие участники"
        :disabled="currentPage === 0"
        @click="goToPage(currentPage - 1)"
      >
        <Icon :name="IconNameEnum.leftBig" />
      </button>
      <div class="call-modal__pagination-dots">
        <button
          v-for="page in visiblePages"
          :key="page"
          class="call-modal__pagination-dot"
          type="button"
          :aria-label="`Страница участников ${page} из ${totalPages}`"
          :aria-current="currentPage === page - 1 ? 'page' : undefined"
          :class="{
            'call-modal__pagination-dot--active': currentPage === page - 1
          }"
          @click="goToPage(page - 1)"
        ></button>
      </div>
      <button
        class="call-modal__pagination-arrow"
        type="button"
        aria-label="Следующие участники"
        :disabled="currentPage === totalPages - 1"
        @click="goToPage(currentPage + 1)"
      >
        <Icon :name="IconNameEnum.rightBig" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type CSSProperties } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import ConnectionQualityIndicator from './UI/ConnectionQualityIndicator.vue';
import ScreenShareParticipantsStrip from './ScreenShareParticipantsStrip.vue';
import ReactionVideoOverlay from './ReactionVideoOverlay.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';

const emit = defineEmits<{
  (event: 'resize-grid', area: { width: number; height: number }): void;
  (event: 'select-participant', identity: string | null): void;
}>();

const panel = ref<HTMLElement | null>(null);
watch(panel, (element, _, onCleanup) => {
  if (!element) return;
  const observer = new element.ownerDocument.defaultView!.ResizeObserver(
    ([entry]) => {
      emit('resize-grid', {
        width: entry.contentRect.width,
        height: entry.contentRect.height
      });
    }
  );
  observer.observe(element);
  onCleanup(() => observer.disconnect());
});

const props = defineProps<{
  participants: Array<{
    identity: string;
    tileId: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isVideoActive: boolean;
    isLocal: boolean;
    isHandRaised: boolean;
    activeReactionEmoji: string;
    activeReactionVideoSrc: string;
    activeReactionVideoKey: string;
    isSpeaking: boolean;
    audioLevel: number;
    isMicActive: boolean;
    connectionQuality: string;
    hasAudio: boolean;
    backgroundPlaceholderStyle?: CSSProperties | null;
  }>;
  focusedParticipant: {
    identity: string;
    tileId: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isHandRaised: boolean;
    activeReactionEmoji: string;
    activeReactionVideoSrc: string;
    activeReactionVideoKey: string;
    isMicActive: boolean;
    audioLevel?: number;
    connectionQuality?: string;
    backgroundPlaceholderStyle?: CSSProperties | null;
  } | null;
  currentPage: number;
  currentPageParticipantCount: number;
  totalPages: number;
  goToPage: (page: number) => void;
  setRemoteVideoRef: (identity: string, el: Element | null) => void;
}>();

const visiblePages = computed(() => {
  const count = Math.min(5, props.totalPages);
  const first = Math.max(
    1,
    Math.min(props.currentPage - 1, props.totalPages - count + 1)
  );
  return Array.from({ length: count }, (_, index) => first + index);
});

let swipe: { id: number; x: number; y: number; horizontal: boolean } | null =
  null;
let suppressClickUntil = 0;

const cancelSwipe = () => {
  swipe = null;
};

const handleTouchStart = (event: TouchEvent) => {
  cancelSwipe();
  if (event.touches.length !== 1 || props.totalPages < 2) return;
  const touch = event.touches[0];
  swipe = {
    id: touch.identifier,
    x: touch.clientX,
    y: touch.clientY,
    horizontal: false
  };
};

const handleTouchMove = (event: TouchEvent) => {
  if (!swipe) return;
  if (event.touches.length !== 1) return cancelSwipe();
  const touch = event.touches[0];
  const dx = Math.abs(touch.clientX - swipe.x);
  const dy = Math.abs(touch.clientY - swipe.y);
  if (!swipe.horizontal && dy > 12 && dy >= dx) return cancelSwipe();
  if (dx > 12 && dx > dy * 1.4) swipe.horizontal = true;
  if (swipe.horizontal && event.cancelable) event.preventDefault();
};

const handleTouchEnd = (event: TouchEvent) => {
  const start = swipe;
  cancelSwipe();
  if (!start) return;
  const touch = Array.from(event.changedTouches).find(
    t => t.identifier === start.id
  );
  if (!touch) return;
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
  // После свайпа WebKit может прислать click по плитке участника.
  suppressClickUntil = Date.now() + 500;
  props.goToPage(
    Math.max(
      0,
      Math.min(props.totalPages - 1, props.currentPage + (dx < 0 ? 1 : -1))
    )
  );
};

const suppressSwipeClick = (event: MouseEvent) => {
  if (Date.now() >= suppressClickUntil) return;
  event.preventDefault();
  event.stopPropagation();
};
</script>

<style scoped>
.call-modal__participants-panel--grid {
  container: call-participants / size;
}
.call-modal__remote-grid {
  touch-action: pan-y pinch-zoom;
}
.call-modal__remote-grid.call-modal__remote-grid--quad {
  min-height: 0;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
}
.call-modal__remote-grid--quad .call-modal__remote-tile {
  min-height: 0;
}
.call-modal__remote-tile {
  container: call-participant / size;
}
.call-modal__pagination-dots {
  margin: 0 auto 2px;
}
.call-modal__pagination-dot {
  position: relative;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  background: transparent;
}
.call-modal__pagination-dot::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 50%;
  background: var(--blue12);
}
.call-modal__pagination-dot--active::before {
  background: var(--text-link);
}
.call-modal__pagination-dot:focus-visible,
.call-modal__pagination-arrow:focus-visible {
  outline: 2px solid var(--text-link);
  outline-offset: 1px;
}
.call-modal__pagination-arrow {
  width: 32px;
  height: 32px;
}
.call-modal__pagination-arrow:disabled {
  opacity: 0.35;
  cursor: default;
}
@container call-participants (max-height: 320px) {
  .call-modal__pagination {
    margin-top: 6px;
  }
}
@container call-participant (max-height: 140px) {
  .call-modal__remote-placeholder {
    box-sizing: border-box;
    padding-bottom: 24px;
  }
  .call-modal__remote-grid .call-modal__avatar {
    --size-avatar: 16px;
  }
  .call-modal__remote-grid .call-modal__avatar :deep(.avatar-yui-kit__text) {
    font-size: 20px;
  }
  .call-modal__remote-name {
    left: 4px;
    bottom: 4px;
    max-width: calc(100% - 8px);
    padding: 2px 6px;
    font-size: 10px;
  }
  .call-modal__remote-name :deep(svg) {
    width: 14px;
    height: 14px;
  }
}
@container call-participant (max-height: 80px) {
  .call-modal__remote-grid .call-modal__avatar {
    --size-avatar: 12px;
  }
  .call-modal__remote-grid .call-modal__avatar :deep(.avatar-yui-kit__text) {
    font-size: 16px;
  }
}
@container call-participant (max-height: 64px) {
  .call-modal__remote-grid .call-modal__avatar {
    --size-avatar: 8px;
  }
  .call-modal__remote-grid .call-modal__avatar :deep(.avatar-yui-kit__text) {
    font-size: 12px;
  }
}
@container call-participant (max-width: 120px) {
  .call-modal__connection-quality {
    top: 4px;
    right: 4px;
    width: 24px;
    height: 16px;
    padding: 2px 5px;
  }
  .call-modal__connection-quality
    :deep(.call-modal__connection-quality-bar:nth-child(1)) {
    height: 4px;
  }
  .call-modal__connection-quality
    :deep(.call-modal__connection-quality-bar:nth-child(2)) {
    height: 7px;
  }
  .call-modal__connection-quality
    :deep(.call-modal__connection-quality-bar:nth-child(3)) {
    height: 10px;
  }
}
.call-modal__remote-grid.call-modal__remote-grid--group-duo {
  min-height: 0;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: repeat(2, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
}
.call-modal__remote-grid.call-modal__remote-grid--group-duo
  .call-modal__remote-tile {
  min-height: 0;
}
@container call-participants (min-aspect-ratio: 1 / 1) {
  .call-modal__remote-grid.call-modal__remote-grid--group-duo {
    min-height: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr);
    grid-auto-rows: minmax(0, 1fr);
  }
}
</style>
