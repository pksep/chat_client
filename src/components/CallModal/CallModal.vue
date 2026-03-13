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
      <div class="call-modal__avatar-container">
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
        class="call-modal__webrtc-container"
      >
        <video
          ref="remoteVideo"
          autoplay
          playsinline
          class="call-modal__remote-video"
        ></video>
        <video
          ref="localVideo"
          autoplay
          playsinline
          muted
          class="call-modal__local-video"
        ></video>
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
          <button
            v-if="!isMobile"
            class="call-modal__control-button call-modal__control-button--fullscreen"
            @click="webRTCState.isFullScreen = !webRTCState.isFullScreen"
            title="Fullscreen"
          >
            <FullscreenIcon v-if="!webRTCState.isFullScreen" />
            <MinimizeIcon v-else />
          </button>

          <Icon
            v-else
            :name="IconNameEnum.chevronDown"
            @click="hideModal"
            class="call-modal__control-button call-modal__control-button__chevron-down"
          />

          <div class="call-modal__control-button-wrapper">
            <button
              v-if="false && Capacitor.isNativePlatform()"
              class="call-modal__control-button"
              :class="{
                'call-modal__control-button__inactive':
                  !webRTCState.isSpeakerActive
              }"
              @click="
                webRTCState.isSpeakerActive = !webRTCState.isSpeakerActive
              "
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
import CallIcon from './UI/CallIcon.vue';
import LeaveIcon from './UI/LeaveIcon.vue';
import {
  isWebRTCOpen,
  isWebRTCIncoming,
  isWebRTCCalling,
  isWebRTCModalVisible,
  webRTCUser,
  webRTCState,
  localStream,
  remoteStream,
  formattedTime,
  acceptWebRTCCall,
  endWebRTCCall
} from '../../services/useWebRTC';
import { watch, ref } from 'vue';

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

const handleToggleMic = () => {
  webRTCState.isMicActive = !webRTCState.isMicActive;
  if (localStream.value) {
    localStream.value.getAudioTracks().forEach(track => {
      track.enabled = webRTCState.isMicActive;
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
};
</script>
