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
      :set-remote-audio-ref="setRemoteAudioRef"
      @select-participant="emit('select-participant', $event)"
    />

    <div
      v-if="!!focusedParticipant"
      class="call-modal__participant-stage"
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
      >
        <CachedAvatar
          :path="focusedParticipant.avatarUrl"
          :alt="focusedParticipant.name"
          class="call-modal__avatar"
          :initials="focusedParticipant.initials"
        />
      </div>
      <div
        v-if="focusedParticipant?.isHandRaised"
        class="call-modal__remote-hand"
        :title="`${focusedParticipant.name} raised a hand`"
      >
        <HandRaiseIcon />
      </div>
      <div v-if="focusedParticipant" class="call-modal__remote-name">
        {{ focusedParticipant.name }}
        <MicIcon v-if="focusedParticipant.isMicActive" />
        <MicDisableIcon v-else />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import CallParticipantsPanel from './CallParticipantsPanel.vue';
import FullscreenIcon from './UI/FullscreenIcon.vue';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import MicIcon from './UI/MicIcon.vue';
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
    isSpeaking: boolean;
    isMicActive: boolean;
    hasAudio: boolean;
  }>;
  focusedParticipant: {
    identity: string;
    tileId: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isLocal: boolean;
    isHandRaised: boolean;
    isMicActive: boolean;
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
  setRemoteAudioRef: (identity: string, el: Element | null) => void;
}>();
</script>
