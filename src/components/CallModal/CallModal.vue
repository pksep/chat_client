<template>
  <div v-if="props.open" class="call-modal">
    <div
      v-if="props.user"
      class="call-modal__container"
      :class="{
        'call-modal__container--full-screen': state.isFullScreen || isMobile
      }"
      :data-testid="`${dataTestid}-Container`"
    >
      <div class="call-modal__avatar-container">
        <h3 class="call-modal__user-name">
          {{ props.user.initials }}
        </h3>
        <p class="call-modal__status">02:50</p>

        <Avatar
          :url="`${config.CHAT_PATH_TO_FILE_CDN}/${props.user.avatarUrl}`"
          :alt="props.user.avatarUrl"
          class="call-modal__avatar"
          :initials="props.user.initials"
          :data-testid="`${dataTestid}-Avatar`"
        />
      </div>

      <div class="call-modal__controls">
        <button
          v-if="!isMobile"
          class="call-modal__control-button call-modal__control-button--fullscreen"
          @click="toggleFullScreen"
          title="Fullscreen"
          :data-testid="`${dataTestid}-FullscreenButton`"
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
          <LeaveIcon class="call-modal__control-button" @click="handleClose" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import { Avatar, Icon, IconNameEnum } from '@pksep/yui';
import { MAX_W_MD } from '../../utils/constants';
import { useResizeState } from '../../composables/useResizeState';
import { getConfig } from '../../services/useConfig';
import FullscreenIcon from './UI/FullscreenIcon.vue';
import '../../assets/call-modal.css';
import MinimizeIcon from './UI/MinimizeIcon.vue';
import VolumeIcon from './UI/VolumeIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import VideoIcon from './UI/VideoIcon.vue';
import LeaveIcon from './UI/LeaveIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import VideoDisableIcon from './UI/VideoDisableIcon.vue';

interface ICallModalProps {
  open: boolean;
  user?: {
    avatarUrl?: string;
    initials: string;
    id: string;
  };
  dataTestid?: string;
}

const props = withDefaults(defineProps<ICallModalProps>(), {
  dataTestid: 'CallModal'
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
}>();

const config = getConfig();
const { state: isMobile } = useResizeState(MAX_W_MD);

const state = reactive({
  isFullScreen: false,
  isMicActive: true,
  isVideoActive: true
});

const toggleFullScreen = () => {
  state.isFullScreen = !state.isFullScreen;
};

const toggleMic = () => {
  state.isMicActive = !state.isMicActive;
};

const toggleVideo = () => {
  state.isVideoActive = !state.isVideoActive;
};

const handleClose = () => {
  emits('unmount-close');
};
</script>
