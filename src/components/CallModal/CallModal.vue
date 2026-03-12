<template>
  <div @click.stop v-if="open || openCall" class="call-modal">
    <div
      class="call-modal__container"
      :class="{
        'call-modal__container--full-screen': state.isFullScreen || isMobile
      }"
    >
      <div class="call-modal__avatar-container">
        <h3 v-if="user" class="call-modal__user-name">
          {{ user.initials }}
        </h3>
        <p class="call-modal__status">
          <span v-if="isIncoming">Входящий вызов...</span>
          <span v-else-if="isCalling">Соединение...</span>
          <span v-else>{{ formattedTime }}</span>
        </p>

        <Avatar
          v-if="user"
          :url="`${config.CHAT_PATH_TO_FILE_CDN}/${user.avatarUrl}`"
          :alt="user.avatarUrl"
          class="call-modal__avatar"
          :initials="user.initials"
        />
      </div>
      <div
        v-show="!isIncoming && !isCalling"
        ref="jitsiContainer"
        class="call-modal__video"
      ></div>

      <div class="call-modal__controls">
        <template v-if="isIncoming">
          <div
            class="call-modal__control-button-wrapper call-modal__control-button-wrapper--incoming"
          >
            <button
              class="call-modal__control-button call-modal__control-button--answer"
              @click="confirmAnswer"
            >
              <CallIcon />
            </button>
            <button
              class="call-modal__control-button call-modal__control-button--reject"
              @click="rejectCall"
            >
              <LeaveIcon />
            </button>
          </div>
        </template>
        <template v-else>
          <button
            v-if="!isMobile"
            class="call-modal__control-button call-modal__control-button--fullscreen"
            @click="toggleFullScreen"
            title="Fullscreen"
          >
            <FullscreenIcon v-if="!state.isFullScreen" />
            <MinimizeIcon v-else />
          </button>

          <Icon
            v-else
            :name="IconNameEnum.chevronDown"
            class="call-modal__control-button call-modal__control-button__chevron-down"
          />

          <div class="call-modal__control-button-wrapper">
            <VolumeIcon class="call-modal__control-button" />
            <MicIcon
              v-if="state.isMicActive"
              class="call-modal__control-button"
              @click="toggleMic"
            />
            <MicDisableIcon
              v-else
              class="call-modal__control-button call-modal__control-button__inactive"
              @click="toggleMic"
            />
            <VideoIcon
              v-if="state.isVideoActive"
              class="call-modal__control-button"
              @click="toggleVideo"
            />
            <VideoDisableIcon
              v-else
              class="call-modal__control-button call-modal__control-button__inactive"
              @click="toggleVideo"
            />
            <LeaveIcon class="call-modal__control-button" @click="leaveCall" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Avatar, Icon, IconNameEnum } from '@pksep/yui';
import { MAX_W_MD } from '../../utils/constants';
import { useResizeState } from '../../composables/useResizeState';
import { getConfig } from '../../services/useConfig';
import FullscreenIcon from './UI/FullscreenIcon.vue';
import MinimizeIcon from './UI/MinimizeIcon.vue';
import VolumeIcon from './UI/VolumeIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import VideoIcon from './UI/VideoIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import VideoDisableIcon from './UI/VideoDisableIcon.vue';
import CallIcon from './UI/CallIcon.vue';
import LeaveIcon from './UI/LeaveIcon.vue';
import {
  open,
  openCall,
  isIncoming,
  isCalling,
  user,
  state,
  jitsiContainer,
  formattedTime,
  toggleMic,
  toggleVideo,
  toggleFullScreen,
  leaveCall,
  confirmAnswer,
  rejectCall
} from '../../services/useJitsi';

const config = getConfig();
const { state: isMobile } = useResizeState(MAX_W_MD);
</script>
