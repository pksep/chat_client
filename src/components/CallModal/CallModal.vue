<template>
  <div
    v-if="isCallOpen"
    class="call-modal"
    :class="{ 'call-modal--hidden': !isCallModalVisible }"
    @click.stop="hideModal"
  >
    <div
      class="call-modal__container"
      :class="{
        'call-modal__container--full-screen':
          liveKitState.isFullScreen || isMobile
      }"
      @click.stop
    >
      <div v-show="showAvatarFallback" class="call-modal__avatar-container">
        <h3 v-if="displayUser" class="call-modal__user-name">
          {{ displayUser?.initials }}
        </h3>
        <p class="call-modal__status">
          <span v-if="isIncoming">Входящий вызов...</span>
          <span v-else-if="isCalling">Соединение...</span>
          <span v-else>{{ formattedTime }}</span>
        </p>

        <Avatar
          v-if="displayUser"
          :url="`${config.CHAT_PATH_TO_FILE_CDN}/${displayUser?.avatarUrl}`"
          :alt="displayUser?.avatarUrl"
          class="call-modal__avatar"
          :initials="displayUser?.initials"
        />
      </div>

      <GroupCallLayout
        v-if="shouldShowMediaLayout && isGroupCallLayout"
        :is-remote-video-active="isRemoteVideoActive"
        :active-screen-share="activeScreenShare"
        :participants="visibleGroupParticipants"
        :current-page="currentParticipantPage"
        :current-page-participant-count="visibleGroupParticipantCount"
        :total-pages="totalParticipantPages"
        :go-to-page="goToParticipantPage"
        :set-screen-share-video-ref="setScreenShareVideoRef"
        :set-remote-video-ref="setRemoteVideoRef"
        :set-remote-audio-ref="setRemoteAudioRef"
      />

      <div v-if="showGroupInfoBar" class="call-modal__group-info">
        <div>
          <button
            v-if="!isMobile"
            class="call-modal__control-button call-modal__control-button--action"
            title="Fullscreen"
            @click="liveKitState.isFullScreen = !liveKitState.isFullScreen"
          >
            <FullscreenIcon v-if="!liveKitState.isFullScreen" />
            <MinimizeIcon v-else />
          </button>
          <Icon
            v-else
            :name="IconNameEnum.chevronDown"
            class="call-modal__control-button call-modal__control-button__chevron-down-group"
            @click="hideModal"
          />
          <div class="call-modal__group-info-text">
            <p>{{ resolvedGroupCallTitle }}</p>
            <span>{{ displayGroupCallMeta }}</span>
          </div>
        </div>

        <button
          class="call-modal__control-button call-modal__control-button--action"
          @click="state.openGroupInfoModal = true"
        >
          <GroupInfoIcon />
        </button>
      </div>

      <DirectCallLayout
        v-if="shouldShowMediaLayout && !isGroupCallLayout"
        :is-remote-video-active="isRemoteVideoActive"
        :live-kit-state="liveKitState"
        :remote-participants="visibleParticipantGridViews"
        :set-local-video-ref="setLocalVideoRef"
        :set-remote-video-ref="setRemoteVideoRef"
        :set-remote-audio-ref="setRemoteAudioRef"
      />

      <div class="call-modal__controls">
        <template v-if="isIncoming">
          <div
            class="call-modal__control-button-wrapper call-modal__control-button-wrapper--incoming"
          >
            <button
              class="call-modal__control-button call-modal__control-button--answer"
              @click="acceptCall"
            >
              <LeaveIcon />
            </button>
            <button
              class="call-modal__control-button call-modal__control-button--reject"
              @click="leaveCall"
            >
              <LeaveIcon />
            </button>
          </div>
        </template>
        <template v-else>
          <template v-if="!isMobile">
            <div
              v-if="isRemoteVideoActive && !isGroupCallLayout"
              class="call-modal__info"
            >
              <button
                class="call-modal__control-button call-modal__control-button--fullscreen"
                title="Fullscreen"
                @click="liveKitState.isFullScreen = !liveKitState.isFullScreen"
              >
                <FullscreenIcon v-if="!liveKitState.isFullScreen" />
                <MinimizeIcon v-else />
              </button>
              <div>
                <p>{{ displayUser?.initials }}</p>
                <span>{{ formattedTime }}</span>
              </div>
            </div>
          </template>
          <Icon
            v-else-if="!isGroupCallLayout"
            :name="IconNameEnum.chevronDown"
            class="call-modal__control-button call-modal__control-button__chevron-down"
            @click="hideModal"
          />

          <div class="call-modal__control-button-wrapper">
            <button
              v-if="Capacitor.isNativePlatform()"
              class="call-modal__control-button"
              :class="{
                'call-modal__control-button__inactive':
                  !liveKitState.isSpeakerActive
              }"
              @click="handleToggleAudioOutput"
            >
              <VolumeIcon v-if="liveKitState.isSpeakerActive" />
              <EarpieceIcon v-else />
            </button>

            <button
              v-if="liveKitState.isMicActive"
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
              v-if="liveKitState.isVideoActive"
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

            <button
              v-if="!isMobile && !Capacitor.isNativePlatform()"
              class="call-modal__control-button"
              :class="{
                'call-modal__control-button__inactive':
                  !liveKitState.isScreenSharingActive
              }"
              @click="handleToggleScreenShare"
            >
              <ScreenShareIcon />
            </button>

            <button class="call-modal__control-button" @click="leaveCall">
              <LeaveIcon />
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>

  <GroupCallInfoPanel
    :open="state.openGroupInfoModal"
    :is-mobile="isMobile"
    :title="resolvedGroupCallTitle"
    :meta="displayGroupCallMeta"
    :members="groupInfoMembers"
    :on-copy-link="copyInviteGroupCallLink"
    @close="state.openGroupInfoModal = false"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
import LeaveIcon from './UI/LeaveIcon.vue';
import ScreenShareIcon from './UI/ScreenShareIcon.vue';
import DirectCallLayout from './DirectCallLayout.vue';
import GroupCallLayout from './GroupCallLayout.vue';
import GroupCallInfoPanel from './GroupCallInfoPanel.vue';
import {
  activeScreenShare,
  acceptCall,
  copyInvitedGroupCallLink as copyInviteGroupCallLink,
  formattedTime,
  isCalling,
  isIncoming,
  isModalVisible as isCallModalVisible,
  isRemoteVideoActive,
  invitedGroupCall,
  leaveCall,
  localVideoStream,
  open as isCallOpen,
  remoteParticipants,
  state as liveKitState,
  toggleMic,
  toggleScreenShare,
  toggleSpeaker,
  toggleVideo,
  topicId as activeTopicId,
  user as activeUser
} from '../../services/useLiveKit';
import { AudioOutput } from '../../services/useAudioOutput';
import {
  disableProximityLock,
  enableProximityLock
} from '../../services/useProximityLock';
import {
  hideIncomingCallScreen,
  showIncomingCallScreen
} from '../../services/useCallScreen';
import { getUsersList } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';
import { useTopics } from '../../composables/useTopics';
import { TopicType } from '../../services/useChatSDK/types';
import { currentGroup, getGroupById } from '../../composables/useGroup';
import GroupInfoIcon from './UI/GroupInfoIcon.vue';

const config = getConfig();
const { state: isMobile } = useResizeState(MAX_W_MD);
const { getSelectedTopic } = useTopics();

const localVideo = ref<HTMLVideoElement | null>(null);
const screenShareVideo = ref<HTMLVideoElement | null>(null);
const remoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({});
const remoteAudioRefs = ref<Record<string, HTMLAudioElement | null>>({});
const currentParticipantPage = ref(0);
const maxParticipantsPerPage = computed(() =>
  isMobile.value ? 4 : liveKitState.isFullScreen ? 9 : 6
);
const state = ref({
  openGroupInfoModal: false
});

const remoteParticipantViews = computed(() =>
  [
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value,
    ...remoteParticipants.value
  ].map(participant => {
    const knownUser = getUsersList().find(
      (item: any) => item.id === participant.identity
    ) as any;

    return {
      ...participant,
      initials:
        knownUser?.initials ||
        participant.name
          .split(' ')
          .map(part => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
      avatarUrl: knownUser?.avatarUrl || ''
    };
  })
);

const currentCallTopic = computed(() =>
  activeTopicId.value
    ? (getSelectedTopic(activeTopicId.value) as any) || null
    : null
);

const isGroupCallLayout = computed(
  () =>
    currentCallTopic.value?.type === TopicType.Group || !!invitedGroupCall.value
);

const displayUser = computed(() => {
  if (isGroupCallLayout.value) {
    return (getAuthUser() as any) || (activeUser.value as any);
  }

  return activeUser.value as any;
});

const localParticipantView = computed(() => {
  const authUser = getAuthUser() as any;
  if (!authUser) return null;

  return {
    identity: authUser.id,
    name: authUser.initials || authUser.nickname || 'You',
    initials: authUser.initials || 'Y',
    avatarUrl: authUser.avatarUrl || '',
    isVideoActive:
      !!localVideoStream.value &&
      (liveKitState.isVideoActive || liveKitState.isScreenSharingActive),
    videoStream: localVideoStream.value,
    audioStream: null,
    isLocal: true
  };
});

const participantGridViews = computed(() => {
  const remoteViews = remoteParticipantViews.value.map(participant => ({
    ...participant,
    isLocal: false
  }));

  if (!isGroupCallLayout.value) {
    return remoteViews;
  }

  return localParticipantView.value
    ? [...remoteViews, localParticipantView.value]
    : remoteViews;
});

const participantGridCount = computed(() => participantGridViews.value.length);
const totalParticipantPages = computed(() =>
  Math.max(
    1,
    Math.ceil(participantGridCount.value / maxParticipantsPerPage.value)
  )
);
const visibleParticipantGridViews = computed(() => {
  const start = currentParticipantPage.value * maxParticipantsPerPage.value;
  return participantGridViews.value.slice(
    start,
    start + maxParticipantsPerPage.value
  );
});
const visibleGroupParticipants = computed(() => {
  return visibleParticipantGridViews.value;
  if (!activeScreenShare.value) {
    return visibleParticipantGridViews.value;
  }

  return visibleParticipantGridViews.value.filter(
    participant => participant.identity !== activeScreenShare.value?.identity
  );
});
const visibleGroupParticipantCount = computed(
  () => visibleGroupParticipants.value.length
);
const participantCountLabel = computed(() => {
  const count = participantGridCount.value;

  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} участник`;
  }

  if (
    count % 10 >= 2 &&
    count % 10 <= 4 &&
    (count % 100 < 12 || count % 100 > 14)
  ) {
    return `${count} участника`;
  }

  return `${count} участников`;
});
const groupCallTitle = computed(
  () => currentCallTopic.value?.name || 'Групповой звонок'
);

const resolvedGroupCallTitle = computed(
  () => invitedGroupCall.value?.title || groupCallTitle.value
);
const groupInfoMembers = computed(
  () => currentGroup.value?.members || invitedGroupCall.value?.members || []
);
const displayGroupCallMeta = computed(
  () => `${formattedTime.value} · ${participantCountLabel.value}`
);

const shouldShowMediaLayout = computed(
  () =>
    isCallOpen.value &&
    !isIncoming.value &&
    !isCalling.value &&
    (isGroupCallLayout.value ||
      isRemoteVideoActive.value ||
      liveKitState.isVideoActive ||
      liveKitState.isScreenSharingActive)
);

const showGroupInfoBar = computed(
  () => shouldShowMediaLayout.value && isGroupCallLayout.value
);

const showAvatarFallback = computed(
  () =>
    isIncoming.value ||
    isCalling.value ||
    (!isGroupCallLayout.value && !isRemoteVideoActive.value)
);

watch(
  [screenShareVideo, activeScreenShare],
  ([video, screenShare]) => {
    if (video) {
      video.srcObject = screenShare?.stream || null;
    }
  },
  { immediate: true }
);

watch(
  [localVideo, localVideoStream],
  ([video, stream]) => {
    if (video) {
      video.srcObject = stream;
    }
  },
  { immediate: true }
);

watch(
  remoteParticipants,
  participants => {
    participants.forEach(participant => {
      const video = remoteVideoRefs.value[participant.identity];
      const audio = remoteAudioRefs.value[participant.identity];

      if (video) {
        video.srcObject = participant.videoStream;
      }

      if (audio) {
        audio.srcObject = participant.audioStream;
      }
    });
  },
  { immediate: true, deep: true }
);

watch(
  participantGridCount,
  count => {
    const lastPage = Math.max(
      0,
      Math.ceil(count / maxParticipantsPerPage.value) - 1
    );
    if (currentParticipantPage.value > lastPage) {
      currentParticipantPage.value = lastPage;
    }
  },
  { immediate: true }
);

watch(
  maxParticipantsPerPage,
  pageSize => {
    const lastPage = Math.max(
      0,
      Math.ceil(participantGridCount.value / pageSize) - 1
    );
    if (currentParticipantPage.value > lastPage) {
      currentParticipantPage.value = lastPage;
    }
  },
  { immediate: true }
);

watch(
  currentCallTopic,
  topic => {
    if (topic?.type === TopicType.Group && topic?.id) {
      getGroupById(topic.id);
    }
  },
  { immediate: true }
);

watch([isCallOpen, isIncoming, isCalling], ([open, incoming]) => {
  if (open) {
    showIncomingCallScreen();

    if (!incoming) {
      if (!liveKitState.isSpeakerActive) {
        enableProximityLock();
      } else {
        disableProximityLock();
      }

      if (Capacitor.isNativePlatform()) {
        AudioOutput.toggleAudio({
          useSpeaker: liveKitState.isSpeakerActive
        }).catch(err =>
          console.warn('Failed to set initial audio output:', err)
        );
      }
    }
  } else {
    hideIncomingCallScreen();
    disableProximityLock();
  }
});

const setLocalVideoRef = (el: Element | null) => {
  localVideo.value = el as HTMLVideoElement | null;
  if (localVideo.value) {
    localVideo.value.srcObject = localVideoStream.value;
  }
};

const setScreenShareVideoRef = (el: Element | null) => {
  screenShareVideo.value = el as HTMLVideoElement | null;
  if (screenShareVideo.value) {
    screenShareVideo.value.srcObject = activeScreenShare.value?.stream || null;
  }
};

const setRemoteVideoRef = (identity: string, el: Element | null) => {
  remoteVideoRefs.value[identity] = el as HTMLVideoElement | null;
  const participant = participantGridViews.value.find(
    item => item.identity === identity
  ) as any;

  if (el && participant) {
    (el as HTMLVideoElement).srcObject = participant.videoStream;
  }
};

const setRemoteAudioRef = (identity: string, el: Element | null) => {
  remoteAudioRefs.value[identity] = el as HTMLAudioElement | null;
  const participant = remoteParticipants.value.find(
    item => item.identity === identity
  );

  if (el && participant) {
    (el as HTMLAudioElement).srcObject = participant.audioStream;
  }
};

const goToParticipantPage = (page: number) => {
  currentParticipantPage.value = Math.max(
    0,
    Math.min(page, totalParticipantPages.value - 1)
  );
};

const hideModal = () => {
  if (!isIncoming.value) {
    isCallModalVisible.value = false;
  }
};

const handleToggleAudioOutput = () => {
  toggleSpeaker();
};

const handleToggleMic = async () => {
  await toggleMic();
};

const handleToggleVideo = async () => {
  await toggleVideo();
};

const handleToggleScreenShare = async () => {
  await toggleScreenShare();
};
</script>
