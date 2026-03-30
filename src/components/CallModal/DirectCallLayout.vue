<template>
  <div
    class="call-modal__livekit-container call-modal__livekit-container--direct"
    :class="{
      'call-modal__livekit-container--transparent': !isRemoteVideoActive
    }"
  >
    <div class="call-modal__direct-stage">
      <div
        v-for="participant in remoteParticipants"
        :key="participant.identity"
        class="call-modal__direct-remote"
      >
        <video
          v-show="participant.isVideoActive"
          :ref="el => setRemoteVideoRef(participant.identity, el as Element)"
          autoplay
          playsinline
          class="call-modal__remote-video"
        ></video>
        <audio
          :ref="el => setRemoteAudioRef(participant.identity, el as Element)"
          autoplay
        ></audio>
        <div
          v-if="!participant.isVideoActive"
          class="call-modal__remote-placeholder"
        >
          <Avatar
            :url="
              participant.avatarUrl
                ? `${config.CHAT_PATH_TO_FILE_CDN}/${participant.avatarUrl}`
                : ''
            "
            :alt="participant.name"
            class="call-modal__avatar"
            :initials="participant.initials"
          />
        </div>
        <div class="call-modal__remote-name">{{ participant.name }}</div>
      </div>
    </div>

    <div
      class="call-modal__local-video"
      v-show="liveKitState.isVideoActive || liveKitState.isScreenSharingActive"
    >
      <video :ref="setLocalVideoRef" autoplay playsinline muted></video>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Avatar } from '@pksep/yui';
import { getConfig } from '../../services/useConfig';

const config = getConfig();

defineProps<{
  isRemoteVideoActive: boolean;
  liveKitState: {
    isVideoActive: boolean;
    isScreenSharingActive: boolean;
  };
  remoteParticipants: Array<{
    identity: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isVideoActive: boolean;
  }>;
  setLocalVideoRef: (el: Element | null) => void;
  setRemoteVideoRef: (identity: string, el: Element | null) => void;
  setRemoteAudioRef: (identity: string, el: Element | null) => void;
}>();
</script>
