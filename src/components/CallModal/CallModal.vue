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
      <div class="call-modal__group-info">
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
        v-if="shouldShowMediaLayout"
        :is-remote-video-active="isRemoteVideoActive"
        :active-screen-share="activeScreenShare"
        :participants="visibleGroupParticipants"
        :focused-participant="focusedGroupParticipant"
        :focused-participant-has-video="focusedParticipantHasVideo"
        :current-page="currentParticipantPage"
        :current-page-participant-count="visibleGroupParticipantCount"
        :total-pages="totalParticipantPages"
        :go-to-page="goToParticipantPage"
        :set-screen-share-video-ref="setScreenShareVideoRef"
        :set-focused-participant-video-ref="setFocusedParticipantVideoRef"
        :set-remote-video-ref="setRemoteVideoRef"
        :set-remote-audio-ref="setRemoteAudioRef"
        @select-participant="handleSelectParticipant"
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

            <button
              v-if="isGroupCallLayout"
              class="call-modal__control-button"
              :class="{
                'call-modal__control-button__inactive':
                  !liveKitState.isHandRaised
              }"
              @click="handleToggleHandRaise"
            >
              <HandRaiseIcon />
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
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
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
  localScreenShareStream,
  open as isCallOpen,
  remoteParticipants,
  state as liveKitState,
  toggleHandRaise,
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
const focusedParticipantVideo = ref<HTMLVideoElement | null>(null);
const remoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({});
const remoteAudioRefs = ref<Record<string, HTMLAudioElement | null>>({});
const currentParticipantPage = ref(0);
const focusedParticipantIdentity = ref<string | null>(null);
const hasManualParticipantSelection = ref(false);
const maxParticipantsPerPage = computed(() =>
  isMobile.value ? 4 : liveKitState.isFullScreen ? 9 : 6
);
const state = ref({
  openGroupInfoModal: false
});

const buildParticipantEntries = (
  participant: any,
  knownUser: any,
  isLocal: boolean
) => {
  const baseParticipant = {
    identity: participant.identity,
    name: participant.name,
    initials:
      knownUser?.initials ||
      participant.name
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase(),
    avatarUrl: knownUser?.avatarUrl || '',
    audioStream: participant.audioStream || null,
    isLocal,
    isHandRaised: participant.isHandRaised,
    isSpeaking: participant.isSpeaking,
    isMicActive: participant.isMicActive
  };
  const entries: any[] = [];

  if (participant.cameraStream) {
    entries.push({
      ...baseParticipant,
      tileId: `${participant.identity}-camera`,
      streamKind: 'camera',
      videoStream: participant.cameraStream,
      cameraStream: participant.cameraStream,
      screenShareStream: participant.screenShareStream || null,
      isVideoActive: !!participant.isVideoActive,
      isScreenShareActive: false,
      hasAudio: true
    });
  }

  if (participant.screenShareStream) {
    entries.push({
      ...baseParticipant,
      tileId: `${participant.identity}-screen`,
      streamKind: 'screen',
      videoStream: participant.screenShareStream,
      cameraStream: participant.cameraStream || null,
      screenShareStream: participant.screenShareStream,
      isVideoActive: true,
      isScreenShareActive: true,
      hasAudio: false
    });
  }

  if (!entries.length) {
    entries.push({
      ...baseParticipant,
      tileId: `${participant.identity}-avatar`,
      streamKind: 'avatar',
      videoStream: participant.videoStream || null,
      cameraStream: participant.cameraStream || null,
      screenShareStream: participant.screenShareStream || null,
      isVideoActive: false,
      isScreenShareActive: false,
      hasAudio: true
    });
  }

  return entries;
};

const remoteParticipantViews = computed(() =>
  remoteParticipants.value.flatMap(participant => {
    const knownUser = getUsersList().find(
      (item: any) => item.id === participant.identity
    ) as any;

    return buildParticipantEntries(participant, knownUser, false);
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

  return buildParticipantEntries(
    {
      identity: authUser.id,
      name: authUser.initials || authUser.nickname || 'You',
      cameraStream: localVideoStream.value,
      screenShareStream: localScreenShareStream.value,
      videoStream: localVideoStream.value,
      audioStream: null,
      isVideoActive: !!localVideoStream.value && liveKitState.isVideoActive,
      isHandRaised: liveKitState.isHandRaised,
      isSpeaking: false,
      isMicActive: liveKitState.isMicActive
    },
    {
      initials: authUser.initials || 'Y',
      avatarUrl: authUser.avatarUrl || ''
    },
    true
  );
});

const participantGridViews = computed(() => {
  const sortParticipants = (left: any, right: any) => {
    if (left.isLocal !== right.isLocal) {
      return Number(left.isLocal) - Number(right.isLocal);
    }

    if (left.isHandRaised !== right.isHandRaised) {
      return Number(right.isHandRaised) - Number(left.isHandRaised);
    }

    if (left.isSpeaking !== right.isSpeaking) {
      return Number(right.isSpeaking) - Number(left.isSpeaking);
    }

    return left.name.localeCompare(right.name);
  };

  const remoteViews = remoteParticipantViews.value
    .map(participant => ({
      ...participant,
      isLocal: false
    }))
    .sort(sortParticipants);

  const localViews = localParticipantView.value
    ? [...localParticipantView.value].sort(sortParticipants)
    : [];

  return [...remoteViews, ...localViews];
});

const participantGridCount = computed(() => participantGridViews.value.length);
const isScreenShareParticipantsStripActive = computed(() =>
  participantGridViews.value.some(
    participant => participant.tileId === focusedParticipantIdentity.value
  )
);
const totalParticipantPages = computed(() =>
  isScreenShareParticipantsStripActive.value
    ? 1
    : Math.max(
        1,
        Math.ceil(participantGridCount.value / maxParticipantsPerPage.value)
      )
);
const visibleParticipantGridViews = computed(() => {
  if (isScreenShareParticipantsStripActive.value) {
    return participantGridViews.value;
  }

  const start = currentParticipantPage.value * maxParticipantsPerPage.value;
  return participantGridViews.value.slice(
    start,
    start + maxParticipantsPerPage.value
  );
});
const visibleGroupParticipants = computed(() => {
  return visibleParticipantGridViews.value;
});
const visibleGroupParticipantCount = computed(
  () => visibleGroupParticipants.value.length
);
const participantDisplayCount = computed(
  () =>
    new Set(participantGridViews.value.map(participant => participant.identity))
      .size
);
const focusedGroupParticipant = computed(() => {
  const participants = participantGridViews.value;

  if (!participants.length) {
    return null;
  }

  return participants.find(
    participant => participant.tileId === focusedParticipantIdentity.value
  );
});
const focusedParticipantStageStream = computed(() => {
  const participant = focusedGroupParticipant.value as any;

  if (!participant) {
    return null;
  }

  if (participant.isScreenShareActive && participant.screenShareStream) {
    return participant.screenShareStream;
  }

  if (participant.isVideoActive) {
    return participant.cameraStream || participant.videoStream || null;
  }

  return null;
});
const focusedParticipantHasVideo = computed(
  () => !!focusedParticipantStageStream.value
);
const participantCountLabel = computed(() => {
  const count = participantDisplayCount.value;

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
  () => isCallOpen.value && !isIncoming.value && !isCalling.value
);

const showAvatarFallback = computed(() => isIncoming.value || isCalling.value);

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
  [focusedParticipantVideo, focusedParticipantStageStream],
  ([video, stream]) => {
    if (video) {
      video.srcObject = stream;
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
  remoteParticipantViews,
  participants => {
    participants.forEach(participant => {
      const video = remoteVideoRefs.value[participant.tileId];
      const audio = remoteAudioRefs.value[participant.identity];

      if (video) {
        video.srcObject = participant.videoStream;
      }

      if (audio && participant.hasAudio) {
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
  participantGridViews,
  participants => {
    if (!participants.length) {
      focusedParticipantIdentity.value = null;
      hasManualParticipantSelection.value = false;
      return;
    }

    const hasFocusedParticipant = participants.some(
      participant => participant.tileId === focusedParticipantIdentity.value
    );

    if (!hasFocusedParticipant) {
      hasManualParticipantSelection.value = false;
      focusedParticipantIdentity.value =
        [...participants].reverse().find(participant => !participant.isLocal)
          ?.tileId || participants[participants.length - 1].tileId;
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

const setScreenShareVideoRef = (el: Element | null) => {
  screenShareVideo.value = el as HTMLVideoElement | null;
  if (screenShareVideo.value) {
    screenShareVideo.value.srcObject = activeScreenShare.value?.stream || null;
  }
};

const setFocusedParticipantVideoRef = (el: Element | null) => {
  focusedParticipantVideo.value = el as HTMLVideoElement | null;
  if (focusedParticipantVideo.value) {
    focusedParticipantVideo.value.srcObject =
      focusedParticipantStageStream.value;
  }
};

const setRemoteVideoRef = (tileId: string, el: Element | null) => {
  remoteVideoRefs.value[tileId] = el as HTMLVideoElement | null;
  const participant = participantGridViews.value.find(
    item => item.tileId === tileId
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

const handleSelectParticipant = (identity: string | null) => {
  if (!identity) {
    hasManualParticipantSelection.value = false;
    focusedParticipantIdentity.value = null;
    return;
  }
  hasManualParticipantSelection.value = true;
  focusedParticipantIdentity.value = identity;
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

const handleToggleHandRaise = async () => {
  await toggleHandRaise();
};
</script>
