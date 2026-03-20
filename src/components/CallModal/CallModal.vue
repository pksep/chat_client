<template>
  <div
    @click.stop="hideModal"
    v-if="isWebRTCOpen"
    class="call-modal"
    :class="{ 'call-modal--hidden': !isWebRTCModalVisible }"
  >
    <div
      class="call-modal__container"
      :class="{
        'call-modal__container--full-screen':
          webRTCState.isFullScreen || isMobile
      }"
      @click.stop
    >
      <div
        v-show="!isRemoteVideoActive || isWebRTCCalling || isWebRTCIncoming"
        class="call-modal__avatar-container"
      >
        <h3 v-if="webRTCUser" class="call-modal__user-name">
          {{ webRTCUser?.initials }}
        </h3>
        <p class="call-modal__status">
          <span v-if="isWebRTCIncoming">Входящий вызов...</span>
          <span v-else-if="isWebRTCCalling">Соединение...</span>
          <span v-else>{{ formattedTime }}</span>
        </p>

        <Avatar
          v-if="webRTCUser"
          :url="`${config.CHAT_PATH_TO_FILE_CDN}/${webRTCUser?.avatarUrl}`"
          :alt="webRTCUser?.avatarUrl"
          class="call-modal__avatar"
          :initials="webRTCUser?.initials"
        />
      </div>

      <div
        v-if="isWebRTCOpen && !isWebRTCIncoming && !isWebRTCCalling"
        v-show="isRemoteVideoActive || webRTCState.isVideoActive"
        class="call-modal__webrtc-container"
        :class="{
          'call-modal__webrtc-container--transparent': !isRemoteVideoActive
        }"
      >
        <video
          v-show="isRemoteVideoActive"
          ref="remoteVideo"
          autoplay
          playsinline
          class="call-modal__remote-video"
        ></video>
        <div class="call-modal__local-video" v-show="webRTCState.isVideoActive">
          <video ref="localVideo" autoplay playsinline muted></video>
        </div>
      </div>

      <div class="call-modal__controls">
        <template v-if="isWebRTCIncoming">
          <div
            class="call-modal__control-button-wrapper call-modal__control-button-wrapper--incoming"
          >
            <button
              class="call-modal__control-button call-modal__control-button--answer"
              @click="acceptWebRTCCall"
            >
              <LeaveIcon />
            </button>
            <button
              class="call-modal__control-button call-modal__control-button--reject"
              @click="endWebRTCCall"
            >
              <LeaveIcon />
            </button>
          </div>
        </template>
        <template v-else>
          <template v-if="!isMobile">
            <button
              class="call-modal__control-button call-modal__control-button--fullscreen"
              @click="webRTCState.isFullScreen = !webRTCState.isFullScreen"
              title="Fullscreen"
            >
              <FullscreenIcon v-if="!webRTCState.isFullScreen" />
              <MinimizeIcon v-else />
            </button>
            <div v-if="isRemoteVideoActive" class="call-modal__info">
              <p>
                {{ webRTCUser?.initials }}
              </p>
              <span>{{ formattedTime }}</span>
            </div>
          </template>

          <Icon
            v-else
            :name="IconNameEnum.chevronDown"
            @click="hideModal"
            class="call-modal__control-button call-modal__control-button__chevron-down"
          />

          <div class="call-modal__control-button-wrapper">
            <button
              v-if="Capacitor.isNativePlatform()"
              class="call-modal__control-button"
              :class="{
                'call-modal__control-button__inactive':
                  !webRTCState.isSpeakerActive
              }"
              @click="handleToggleAudioOutput"
            >
              <VolumeIcon v-if="webRTCState.isSpeakerActive" />
              <EarpieceIcon v-else />
            </button>

            <button
              v-if="webRTCState.isMicActive"
              class="call-modal__control-button"
              @click="handleToggleMic"
            >
              <MicIcon />
            </button>
            <button
              v-else
              class="call-modal__control-button call-modal__control-button__inactive"
              @click="handleToggleMic"
            >
              <MicDisableIcon />
            </button>

            <button
              v-if="webRTCState.isVideoActive"
              class="call-modal__control-button"
              @click="handleToggleVideo"
              :disabled="webRTCState.isScreenSharingActive"
            >
              <VideoIcon />
            </button>
            <button
              v-else
              class="call-modal__control-button call-modal__control-button__inactive"
              @click="handleToggleVideo"
            >
              <VideoDisableIcon />
            </button>

            <!-- Screen Share Button -->
            <button
              v-if="!isMobile && !Capacitor.isNativePlatform()"
              class="call-modal__control-button"
              :class="{
                'call-modal__control-button__inactive':
                  !webRTCState.isScreenSharingActive
              }"
              @click="handleToggleScreenShare"
            >
              <ScreenShareIcon />
            </button>

            <button class="call-modal__control-button" @click="endWebRTCCall">
              <LeaveIcon />
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Avatar, Icon, IconNameEnum } from '@pksep/yui';
import { Capacitor } from '@capacitor/core';
import { getChatSDK } from '../../services/useChat';
import { WebSocketEventType } from '../../services/useChatSDK/websocketEvents';
import { MAX_W_MD } from '../../utils/constants';
import { useResizeState } from '../../composables/useResizeState';
import { getConfig } from '../../services/useConfig';
import FullscreenIcon from './UI/FullscreenIcon.vue';
import MinimizeIcon from './UI/MinimizeIcon.vue';
import VolumeIcon from './UI/VolumeIcon.vue';
import EarpieceIcon from './UI/EarpieceIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import VideoIcon from './UI/VideoIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import VideoDisableIcon from './UI/VideoDisableIcon.vue';
import LeaveIcon from './UI/LeaveIcon.vue';
import ScreenShareIcon from './UI/ScreenShareIcon.vue';
import {
  isWebRTCOpen,
  isWebRTCIncoming,
  isWebRTCCalling,
  isWebRTCModalVisible,
  webRTCUser,
  webRTCRoomId,
  webRTCState,
  localStream,
  remoteStream,
  isRemoteVideoActive,
  formattedTime,
  acceptWebRTCCall,
  endWebRTCCall,
  toggleSpeaker,
  toggleScreenShare
} from '../../services/useWebRTC';
import { AudioOutput } from '../../services/useAudioOutput';
import { watch, ref } from 'vue';
import {
  enableProximityLock,
  disableProximityLock
} from '../../services/useProximityLock';
import {
  showIncomingCallScreen,
  hideIncomingCallScreen
} from '../../services/useCallScreen';

const config = getConfig();
const { state: isMobile } = useResizeState(MAX_W_MD);

const localVideo = ref<HTMLVideoElement | null>(null);
const remoteVideo = ref<HTMLVideoElement | null>(null);

watch(
  [localVideo, localStream],
  ([video, stream]) => {
    if (video && stream) {
      video.srcObject = stream;
    }
  },
  { immediate: true }
);

watch(
  [remoteVideo, remoteStream],
  ([video, stream]) => {
    if (video && stream) {
      video.srcObject = stream;
    }
  },
  { immediate: true }
);

const hideModal = () => {
  if (!isWebRTCCalling.value && !isWebRTCIncoming.value) {
    isWebRTCModalVisible.value = false;
  }
};

const handleToggleAudioOutput = () => {
  toggleSpeaker();
};

// Enable proximity lock and locked screen behavior when call becomes active
watch([isWebRTCOpen, isWebRTCIncoming, isWebRTCCalling], ([open, incoming]) => {
  if (open) {
    // Put app on top of lock screen
    showIncomingCallScreen();

    if (!incoming) {
      if (!webRTCState.isSpeakerActive) {
        enableProximityLock();
      } else {
        disableProximityLock();
      }

      // Apply initial audio output state
      if (Capacitor.isNativePlatform()) {
        AudioOutput.toggleAudio({
          useSpeaker: webRTCState.isSpeakerActive
        }).catch(err =>
          console.warn('Failed to set initial audio output:', err)
        );
      }
    }
  } else if (!open) {
    hideIncomingCallScreen();
    disableProximityLock();
  }
});

const handleToggleMic = () => {
  webRTCState.isMicActive = !webRTCState.isMicActive;
  if (localStream.value) {
    localStream.value.getAudioTracks().forEach(track => {
      track.enabled = webRTCState.isMicActive;
    });
  }

  const sdk = getChatSDK();
  if (sdk && webRTCUser.value && webRTCRoomId.value) {
    sdk.sendWebSocketEvent(WebSocketEventType.WEBRTC_TRACK_STATUS, {
      toUserId: webRTCUser.value.id,
      video: webRTCState.isVideoActive,
      audio: webRTCState.isMicActive,
      roomId: webRTCRoomId.value
    });
  }
};

const handleToggleVideo = () => {
  webRTCState.isVideoActive = !webRTCState.isVideoActive;
  if (localStream.value) {
    localStream.value.getVideoTracks().forEach(track => {
      track.enabled = webRTCState.isVideoActive;
    });
  }

  const sdk = getChatSDK();
  if (sdk && webRTCUser.value && webRTCRoomId.value) {
    sdk.sendWebSocketEvent(WebSocketEventType.WEBRTC_TRACK_STATUS, {
      toUserId: webRTCUser.value.id,
      video: webRTCState.isVideoActive,
      audio: webRTCState.isMicActive,
      roomId: webRTCRoomId.value
    });
  }
};

const handleToggleScreenShare = async () => {
  if (webRTCState.isVideoActive) {
    handleToggleVideo();
  }
  await toggleScreenShare();
};
</script>
