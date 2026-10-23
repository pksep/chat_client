<template>
  <div class="call-modal__group-layout">
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
          <span>{{ participant.name }}</span>
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
        :disabled="currentPage === 0"
        @click="goToPage(currentPage - 1)"
      >
        <Icon :name="IconNameEnum.leftBig" />
      </button>
      <div class="call-modal__pagination-dots">
        <button
          v-for="page in totalPages"
          :key="page"
          class="call-modal__pagination-dot"
          :class="{
            'call-modal__pagination-dot--active': currentPage === page - 1
          }"
          @click="goToPage(page - 1)"
        ></button>
      </div>
      <button
        class="call-modal__pagination-arrow"
        :disabled="currentPage === totalPages - 1"
        @click="goToPage(currentPage + 1)"
      >
        <Icon :name="IconNameEnum.rightBig" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import ConnectionQualityIndicator from './UI/ConnectionQualityIndicator.vue';
import ScreenShareParticipantsStrip from './ScreenShareParticipantsStrip.vue';
import ReactionVideoOverlay from './ReactionVideoOverlay.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';

const emit = defineEmits<{
  (event: 'select-participant', identity: string | null): void;
}>();

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
.call-modal__remote-grid {
  touch-action: pan-y pinch-zoom;
}
</style>
