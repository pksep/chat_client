<template>
  <div class="call-modal__group-layout">
    <CallParticipantsPanel
      :participants="participants"
      :focused-participant="focusedParticipant"
      :current-page="currentPage"
      :current-page-participant-count="currentPageParticipantCount"
      :total-pages="totalPages"
      :go-to-page="goToPage"
      :set-remote-video-ref="setRemoteVideoRef"
      @select-participant="emit('select-participant', $event)"
    />

    <div
      v-if="!!focusedParticipant"
      class="call-modal__participant-stage"
      :class="{
        'call-modal__participant-stage--speaking': focusedParticipant.isSpeaking
      }"
      @click="emit('select-participant', null)"
    >
      <button
        v-if="canSwitchLocalCamera"
        class="call-modal__control-button call-modal__control-button--action call-modal__participant-stage-button call-modal__participant-stage-button--left"
        type="button"
        title="Switch camera"
        @click.stop="emit('switch-local-camera')"
      >
        <SwitchCameraIcon />
      </button>
      <button
        v-if="focusedParticipantHasVideo"
        class="call-modal__control-button call-modal__control-button--action call-modal__participant-stage-button"
        type="button"
        title="Видео fullscreen"
        @click.stop="emit('open-video-overlay')"
      >
        <FullscreenIcon />
      </button>
      <video
        v-if="focusedParticipantHasVideo"
        :ref="setFocusedParticipantVideoRef"
        autoplay
        playsinline
        muted
        class="call-modal__screen-share-video"
      ></video>
      <div
        v-else-if="focusedParticipant"
        class="call-modal__remote-placeholder"
        :class="{
          'call-modal__remote-placeholder--background':
            !!focusedParticipant.backgroundPlaceholderStyle
        }"
        :style="focusedParticipant.backgroundPlaceholderStyle || undefined"
      >
        <CachedAvatar
          v-if="!focusedParticipant.backgroundPlaceholderStyle"
          :path="focusedParticipant.avatarUrl"
          :alt="focusedParticipant.name"
          class="call-modal__avatar"
          :initials="focusedParticipant.initials"
        />
      </div>
      <ReactionVideoOverlay
        v-if="focusedParticipant?.activeReactionVideoSrc"
        :src="focusedParticipant.activeReactionVideoSrc"
        :video-key="focusedParticipant.activeReactionVideoKey"
        class-name="call-modal__reaction-stage-video"
      />
      <div
        v-if="focusedParticipant?.isHandRaised"
        class="call-modal__remote-hand call-modal__remote-hand--stage"
        :title="`${focusedParticipant?.name} raised a hand`"
      >
        <HandRaiseIcon />
      </div>
      <ConnectionQualityIndicator
        v-if="focusedParticipant"
        class="call-modal__connection-quality--stage"
        :quality="focusedParticipant.connectionQuality"
      />
      <div v-if="focusedParticipant" class="call-modal__remote-name">
        <span>{{ focusedParticipant.name }}</span>
        <MicIcon
          v-if="focusedParticipant.isMicActive"
          :audio-level="focusedParticipant.audioLevel"
          :is-speaking="focusedParticipant.isSpeaking"
        />
        <MicDisableIcon v-else />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue';
import CallParticipantsPanel from './CallParticipantsPanel.vue';
import ConnectionQualityIndicator from './UI/ConnectionQualityIndicator.vue';
import FullscreenIcon from './UI/FullscreenIcon.vue';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import ReactionVideoOverlay from './ReactionVideoOverlay.vue';
import SwitchCameraIcon from './UI/SwitchCameraIcon.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';

const emit = defineEmits<{
  (event: 'select-participant', identity: string | null): void;
  (event: 'open-video-overlay'): void;
  (event: 'switch-local-camera'): void;
}>();

defineProps<{
  isRemoteVideoActive: boolean;
  activeScreenShare: {
    identity: string;
    name: string;
    isLocal: boolean;
  } | null;
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
    isLocal: boolean;
    isScreenShareActive: boolean;
    isHandRaised: boolean;
    activeReactionEmoji: string;
    activeReactionVideoSrc: string;
    activeReactionVideoKey: string;
    isSpeaking: boolean;
    audioLevel: number;
    isMicActive: boolean;
    connectionQuality: string;
    backgroundPlaceholderStyle?: CSSProperties | null;
  } | null;
  focusedParticipantHasVideo: boolean;
  canSwitchLocalCamera: boolean;
  currentPage: number;
  currentPageParticipantCount: number;
  totalPages: number;
  goToPage: (page: number) => void;
  setScreenShareVideoRef: (el: Element | null) => void;
  setFocusedParticipantVideoRef: (el: Element | null) => void;
  setRemoteVideoRef: (identity: string, el: Element | null) => void;
}>();
</script>
