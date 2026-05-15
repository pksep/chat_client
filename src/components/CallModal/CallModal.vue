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
        <h3 v-if="displayAvatarInfo" class="call-modal__user-name">
          {{ displayAvatarInfo.initials }}
        </h3>
        <p class="call-modal__status">
          <span v-if="isIncoming">{{ incomingCallLabel }}</span>
          <span v-else-if="isCalling">{{ connectingLabel }}</span>
          <span v-else>{{ formattedTime }}</span>
        </p>

        <CachedAvatar
          v-if="displayAvatarInfo"
          :path="displayAvatarInfo.avatarUrl"
          :alt="displayAvatarInfo.avatarUrl || displayAvatarInfo.name"
          class="call-modal__avatar"
          :initials="displayAvatarInfo.initials"
        />
      </div>

      <GroupCallLayout
        v-if="shouldShowMediaLayout"
        :is-remote-video-active="isRemoteVideoActive"
        :active-screen-share="activeScreenShare"
        :participants="visibleGroupParticipants"
        :focused-participant="focusedGroupParticipant"
        :focused-participant-has-video="focusedParticipantHasVideo"
        :can-switch-local-camera="canSwitchLocalCamera"
        :current-page="currentParticipantPage"
        :current-page-participant-count="visibleGroupParticipantCount"
        :total-pages="totalParticipantPages"
        :go-to-page="goToParticipantPage"
        :set-screen-share-video-ref="setScreenShareVideoRef"
        :set-focused-participant-video-ref="setFocusedParticipantVideoRef"
        :set-remote-video-ref="setRemoteVideoRef"
        @open-video-overlay="openStageVideoOverlay"
        @select-participant="handleSelectParticipant"
        @switch-local-camera="handleSwitchLocalCamera"
      />

      <div v-if="shouldShowMediaLayout" class="call-modal__remote-audio-layer">
        <audio
          v-for="participant in remoteAudioParticipants"
          :key="participant.identity"
          :ref="el => setRemoteAudioRef(participant.identity, el as Element)"
          autoplay
        ></audio>
      </div>

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
                  !!liveKitState.isSpeakerActive
              }"
              @click="handleToggleAudioOutput"
            >
              <VolumeIcon />
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

    <div
      v-if="isStageVideoOverlayVisible && focusedParticipantHasVideo"
      class="call-modal__video-overlay"
      @mousemove="handleVideoOverlayMouseMove"
      @mouseleave="videoOverlayRegion = null"
      @click.stop
    >
      <video
        :ref="setOverlayFocusedParticipantVideoRef"
        autoplay
        playsinline
        muted
        class="call-modal__video-overlay-video"
        @click.stop="handleVideoOverlayTap"
      ></video>

      <Transition name="call-modal-overlay-top">
        <div
          v-if="
            isMobile
              ? isVideoOverlayControlsVisible
              : videoOverlayRegion === 'top'
          "
          class="call-modal__video-overlay-bar call-modal__video-overlay-bar--top"
          @click.stop
        >
          <div class="call-modal__video-overlay-top-content">
            <div class="call-modal__group-info call-modal__group-info--overlay">
              <div>
                <div class="call-modal__group-info-text">
                  <p>{{ resolvedGroupCallTitle }}</p>
                  <span>{{ displayGroupCallMeta }}</span>
                </div>
              </div>

              <div class="call-modal__video-overlay-actions">
                <button
                  class="call-modal__control-button call-modal__control-button--action"
                  @click="state.openGroupInfoModal = true"
                >
                  <GroupInfoIcon />
                </button>
                <button
                  class="call-modal__control-button call-modal__control-button--action"
                  @click="closeStageVideoOverlay"
                >
                  <MinimizeIcon />
                </button>
              </div>
            </div>

            <CallParticipantsPanel
              :participants="visibleGroupParticipantsForOverlay"
              :focused-participant="focusedGroupParticipant"
              :current-page="currentParticipantPage"
              :current-page-participant-count="visibleGroupParticipantCount"
              :total-pages="totalParticipantPages"
              :go-to-page="goToParticipantPage"
              :set-remote-video-ref="setOverlayRemoteVideoRef"
              @select-participant="handleSelectParticipant"
            />
          </div>
        </div>
      </Transition>

      <Transition name="call-modal-overlay-bottom">
        <div
          v-if="
            isMobile
              ? isVideoOverlayControlsVisible
              : videoOverlayRegion === 'bottom'
          "
          class="call-modal__video-overlay-bar call-modal__video-overlay-bar--bottom"
          @click.stop
        >
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
              <VolumeIcon />
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
        </div>
      </Transition>
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
import { Icon, IconNameEnum } from '@pksep/yui';
import { Capacitor } from '@capacitor/core';
import { MAX_W_MD } from '../../utils/constants';
import { useResizeState } from '../../composables/useResizeState';
import CachedAvatar from '../UI/CachedAvatar.vue';
import FullscreenIcon from './UI/FullscreenIcon.vue';
import MinimizeIcon from './UI/MinimizeIcon.vue';
import VolumeIcon from './UI/VolumeIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import VideoIcon from './UI/VideoIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import VideoDisableIcon from './UI/VideoDisableIcon.vue';
import LeaveIcon from './UI/LeaveIcon.vue';
import ScreenShareIcon from './UI/ScreenShareIcon.vue';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import CallParticipantsPanel from './CallParticipantsPanel.vue';
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
  switchCamera,
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

const { state: isMobile } = useResizeState(MAX_W_MD);
const { getSelectedTopic } = useTopics();

const localVideo = ref<HTMLVideoElement | null>(null);
const screenShareVideo = ref<HTMLVideoElement | null>(null);
const focusedParticipantVideo = ref<HTMLVideoElement | null>(null);
const overlayFocusedParticipantVideo = ref<HTMLVideoElement | null>(null);
const remoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({});
const overlayRemoteVideoRefs = ref<Record<string, HTMLVideoElement | null>>({});
const remoteAudioRefs = ref<Record<string, HTMLAudioElement | null>>({});
const currentParticipantPage = ref(0);
const focusedParticipantIdentity = ref<string | null>(null);
const hasManualParticipantSelection = ref(false);
const shouldSkipInitialParticipantAutofocus = ref(true);
const isStageVideoOverlayVisible = ref(false);
const isVideoOverlayControlsVisible = ref(false);
const videoOverlayRegion = ref<'top' | 'bottom' | null>(null);
const maxParticipantsPerPage = computed(() =>
  isMobile.value ? 4 : liveKitState.isFullScreen ? 9 : 6
);
const state = ref({
  openGroupInfoModal: false
});
const incomingCallLabel = 'Входящий вызов...';
const connectingLabel = 'Соединение...';
const singleParticipantLabel = 'участник';
const fewParticipantsLabel = 'участника';
const manyParticipantsLabel = 'участников';
const callLabel = 'Звонок';
const groupCallLabel = 'Групповой звонок';
const participantOrder = ref<string[]>([]);

const syncMediaElementStream = (
  element: HTMLMediaElement | null,
  stream: MediaStream | null
) => {
  if (!element) return;

  if (element.srcObject !== stream) {
    element.srcObject = stream;
  }

  if (!stream) return;

  void element.play().catch(error => {
    console.warn('[LiveKit] Failed to play media element:', error);
  });
};

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
      hasAudio: !!participant.audioStream
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
      hasAudio: !participant.cameraStream && !!participant.audioStream
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
      hasAudio: !!participant.audioStream
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

const remoteAudioParticipants = computed(() =>
  remoteParticipants.value.filter(
    participant => !!participant.audioStream && !!participant.isMicActive
  )
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
const displayAvatarInfo = computed(() => {
  if (isGroupCallLayout.value) {
    const groupName = resolvedGroupCallTitle.value || groupCallLabel;
    return {
      name: groupName,
      initials: groupName,
      avatarUrl:
        invitedGroupCall.value?.avatarUrl ||
        currentCallTopic.value?.avatarUrl ||
        ''
    };
  }
  if (!displayUser.value) {
    return null;
  }
  return {
    name: displayUser.value.nickname || displayUser.value.initials || callLabel,
    initials: displayUser.value.initials,
    avatarUrl: displayUser.value.avatarUrl || ''
  };
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

const participantDisplayViews = computed(() => [
  ...remoteParticipantViews.value.map(participant => ({
    ...participant,
    isLocal: false
  })),
  ...(localParticipantView.value || [])
]);

const swapParticipantOrder = (
  order: string[],
  participantId: string,
  targetIndex: number
) => {
  const currentIndex = order.indexOf(participantId);

  if (
    currentIndex === -1 ||
    currentIndex === targetIndex ||
    targetIndex < 0 ||
    targetIndex >= order.length
  ) {
    return;
  }

  [order[targetIndex], order[currentIndex]] = [
    order[currentIndex],
    order[targetIndex]
  ];
};

const buildPromotedParticipantOrder = (
  participants: any[],
  currentOrder: string[]
) => {
  const participantMap = new Map(
    participants.map(participant => [participant.tileId, participant])
  );
  const nextOrder = [...currentOrder];
  const promotedParticipantIds = [
    ...nextOrder.filter(
      participantId => participantMap.get(participantId)?.isScreenShareActive
    ),
    ...nextOrder.filter(participantId => {
      const participant = participantMap.get(participantId);

      return !!participant?.isSpeaking && !participant.isScreenShareActive;
    }),
    ...nextOrder.filter(participantId => {
      const participant = participantMap.get(participantId);

      return (
        !!participant?.isHandRaised &&
        !participant.isScreenShareActive &&
        !participant.isSpeaking
      );
    })
  ];

  promotedParticipantIds.forEach((participantId, index) => {
    swapParticipantOrder(nextOrder, participantId, index);
  });

  return nextOrder;
};

const areOrdersEqual = (left: string[], right: string[]) =>
  left.length === right.length &&
  left.every((participantId, index) => participantId === right[index]);

const syncParticipantOrder = (participants: any[]) => {
  const activeParticipantIds = participants.map(
    participant => participant.tileId
  );
  const nextOrder = participantOrder.value.filter(participantId =>
    activeParticipantIds.includes(participantId)
  );

  activeParticipantIds.forEach(participantId => {
    if (!nextOrder.includes(participantId)) {
      nextOrder.push(participantId);
    }
  });

  const promotedOrder = buildPromotedParticipantOrder(participants, nextOrder);

  if (!areOrdersEqual(promotedOrder, participantOrder.value)) {
    participantOrder.value = promotedOrder;
  }
};

const participantGridViews = computed(() => {
  const orderIndexMap = new Map(
    participantOrder.value.map((participantId, index) => [participantId, index])
  );

  return [...participantDisplayViews.value].sort((left, right) => {
    const leftIndex = orderIndexMap.get(left.tileId) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex =
      orderIndexMap.get(right.tileId) ?? Number.MAX_SAFE_INTEGER;

    return leftIndex - rightIndex;
  });
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
const visibleGroupParticipantsForOverlay = computed(() =>
  visibleGroupParticipants.value.map(participant => ({
    ...participant,
    hasAudio: false
  }))
);
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
const canSwitchLocalCamera = computed(
  () =>
    Capacitor.isNativePlatform() &&
    !!focusedGroupParticipant.value?.isLocal &&
    !!focusedParticipantHasVideo.value &&
    liveKitState.isVideoActive
);
const participantCountLabel = computed(() => {
  const count = participantDisplayCount.value;

  if (count % 10 === 1 && count % 100 !== 11) {
    return `${count} ${singleParticipantLabel}`;
  }

  if (
    count % 10 >= 2 &&
    count % 10 <= 4 &&
    (count % 100 < 12 || count % 100 > 14)
  ) {
    return `${count} ${fewParticipantsLabel}`;
  }

  return `${count} ${manyParticipantsLabel}`;
});
const groupCallTitle = computed(() => {
  if (!isGroupCallLayout.value) {
    return (
      displayUser.value?.initials || displayUser.value?.nickname || callLabel
    );
  }
  return currentCallTopic.value?.name || groupCallLabel;
});

const resolvedGroupCallTitle = computed(
  () => invitedGroupCall.value?.title || groupCallTitle.value
);
const groupInfoMembers = computed(() => {
  const sourceMembers = [
    ...(currentGroup.value?.members || []),
    ...(invitedGroupCall.value?.members || []),
    ...getUsersList(),
    ...(displayUser.value ? [displayUser.value as any] : [])
  ];
  const memberMap = new Map(
    sourceMembers
      .filter(member => member?.id)
      .map(member => [member.id, member as any])
  );
  const activeParticipantIds = Array.from(
    new Set(participantGridViews.value.map(participant => participant.identity))
  );

  return activeParticipantIds
    .map(participantId => memberMap.get(participantId))
    .filter(Boolean);
});
const displayGroupCallMeta = computed(
  () => `${participantCountLabel.value} · ${formattedTime.value}`
);

const shouldShowMediaLayout = computed(
  () => isCallOpen.value && !isIncoming.value && !isCalling.value
);

const showAvatarFallback = computed(() => isIncoming.value || isCalling.value);

watch(
  [screenShareVideo, activeScreenShare],
  ([video, screenShare]) => {
    syncMediaElementStream(video, screenShare?.stream || null);
  },
  { immediate: true }
);

watch(
  [focusedParticipantVideo, focusedParticipantStageStream],
  ([video, stream]) => {
    syncMediaElementStream(video, stream);
  },
  { immediate: true }
);

watch(
  [overlayFocusedParticipantVideo, focusedParticipantStageStream],
  ([video, stream]) => {
    syncMediaElementStream(video, stream);
  },
  { immediate: true }
);

watch(
  [localVideo, localVideoStream],
  ([video, stream]) => {
    syncMediaElementStream(video, stream);
  },
  { immediate: true }
);

watch(
  participantDisplayViews,
  participants => {
    syncParticipantOrder(participants);
  },
  { immediate: true, deep: true }
);

watch(
  remoteParticipantViews,
  participants => {
    participants.forEach(participant => {
      const video = remoteVideoRefs.value[participant.tileId];
      const overlayVideo = overlayRemoteVideoRefs.value[participant.tileId];
      const audio = remoteAudioRefs.value[participant.identity];

      if (video) {
        syncMediaElementStream(video, participant.videoStream);
      }

      if (overlayVideo) {
        syncMediaElementStream(overlayVideo, participant.videoStream);
      }

      if (audio && participant.hasAudio) {
        syncMediaElementStream(audio, participant.audioStream);
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
      shouldSkipInitialParticipantAutofocus.value = true;
      isStageVideoOverlayVisible.value = false;
      videoOverlayRegion.value = null;
      return;
    }

    const activeScreenShareParticipant =
      participants.find(participant => participant.isScreenShareActive) || null;

    const hasFocusedParticipant = participants.some(
      participant => participant.tileId === focusedParticipantIdentity.value
    );

    const currentFocusedParticipant = hasFocusedParticipant
      ? participants.find(
          participant => participant.tileId === focusedParticipantIdentity.value
        )
      : null;

    if (!hasFocusedParticipant) {
      if (!activeScreenShareParticipant) {
        focusedParticipantIdentity.value = null;
        hasManualParticipantSelection.value = false;
        shouldSkipInitialParticipantAutofocus.value = false;
        return;
      }

      if (shouldSkipInitialParticipantAutofocus.value) {
        focusedParticipantIdentity.value = null;
        hasManualParticipantSelection.value = false;
        shouldSkipInitialParticipantAutofocus.value = false;
        return;
      }

      hasManualParticipantSelection.value = false;
      focusedParticipantIdentity.value = activeScreenShareParticipant.tileId;
      return;
    }

    if (!currentFocusedParticipant) {
      focusedParticipantIdentity.value =
        activeScreenShareParticipant?.tileId || null;
      hasManualParticipantSelection.value = false;
      return;
    }

    if (hasManualParticipantSelection.value) {
      return;
    }

    if (!activeScreenShareParticipant) {
      focusedParticipantIdentity.value = null;
      return;
    }

    if (
      activeScreenShareParticipant.tileId !== currentFocusedParticipant.tileId
    ) {
      hasManualParticipantSelection.value = false;
      focusedParticipantIdentity.value = activeScreenShareParticipant.tileId;
    }
  },
  { immediate: true }
);

watch(
  [focusedParticipantHasVideo, isCallOpen],
  ([hasVideo, open]) => {
    if (!hasVideo || !open) {
      isStageVideoOverlayVisible.value = false;
      isVideoOverlayControlsVisible.value = false;
      videoOverlayRegion.value = null;
    }
  },
  { immediate: true }
);

watch(
  isCallOpen,
  open => {
    if (!open) {
      focusedParticipantIdentity.value = null;
      hasManualParticipantSelection.value = false;
      shouldSkipInitialParticipantAutofocus.value = true;
      currentParticipantPage.value = 0;
      return;
    }

    focusedParticipantIdentity.value = null;
    hasManualParticipantSelection.value = false;
    shouldSkipInitialParticipantAutofocus.value = true;
    currentParticipantPage.value = 0;
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
  syncMediaElementStream(
    screenShareVideo.value,
    activeScreenShare.value?.stream || null
  );
};

const setFocusedParticipantVideoRef = (el: Element | null) => {
  focusedParticipantVideo.value = el as HTMLVideoElement | null;
  syncMediaElementStream(
    focusedParticipantVideo.value,
    focusedParticipantStageStream.value
  );
};

const setOverlayFocusedParticipantVideoRef = (el: Element | null) => {
  overlayFocusedParticipantVideo.value = el as HTMLVideoElement | null;
  syncMediaElementStream(
    overlayFocusedParticipantVideo.value,
    focusedParticipantStageStream.value
  );
};

const setRemoteVideoRef = (tileId: string, el: Element | null) => {
  remoteVideoRefs.value[tileId] = el as HTMLVideoElement | null;
  const participant = participantGridViews.value.find(
    item => item.tileId === tileId
  ) as any;

  if (el && participant) {
    syncMediaElementStream(
      el as HTMLVideoElement,
      participant.videoStream || null
    );
  }
};

const setOverlayRemoteVideoRef = (tileId: string, el: Element | null) => {
  overlayRemoteVideoRefs.value[tileId] = el as HTMLVideoElement | null;
  const participant = participantGridViews.value.find(
    item => item.tileId === tileId
  ) as any;

  if (el && participant) {
    syncMediaElementStream(
      el as HTMLVideoElement,
      participant.videoStream || null
    );
  }
};

const setRemoteAudioRef = (identity: string, el: Element | null) => {
  remoteAudioRefs.value[identity] = el as HTMLAudioElement | null;
  const participant = remoteParticipants.value.find(
    item => item.identity === identity
  );

  if (el && participant) {
    syncMediaElementStream(
      el as HTMLAudioElement,
      participant.audioStream || null
    );
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
    isStageVideoOverlayVisible.value = false;
    videoOverlayRegion.value = null;
    return;
  }

  hasManualParticipantSelection.value = true;
  focusedParticipantIdentity.value = identity;
};

const openStageVideoOverlay = () => {
  if (!focusedParticipantHasVideo.value) return;

  isStageVideoOverlayVisible.value = true;
  isVideoOverlayControlsVisible.value = isMobile.value;
  videoOverlayRegion.value = isMobile.value ? null : 'top';
};

const closeStageVideoOverlay = () => {
  isStageVideoOverlayVisible.value = false;
  isVideoOverlayControlsVisible.value = false;
  videoOverlayRegion.value = null;
};

const getVideoOverlayRegion = (clientY: number) => {
  const viewportHeight = window.innerHeight || 1;
  const cursorYRatio = clientY / viewportHeight;

  if (cursorYRatio <= 0.35) {
    return 'top' as const;
  }

  if (cursorYRatio >= 0.65) {
    return 'bottom' as const;
  }

  return null;
};

const handleVideoOverlayMouseMove = (event: MouseEvent) => {
  if (isMobile.value) {
    return;
  }

  videoOverlayRegion.value = getVideoOverlayRegion(event.clientY);
};

const handleVideoOverlayTap = () => {
  if (!isMobile.value) {
    return;
  }

  isVideoOverlayControlsVisible.value = !isVideoOverlayControlsVisible.value;
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

const handleSwitchLocalCamera = async () => {
  await switchCamera();
};

const handleToggleScreenShare = async () => {
  if (isMobile.value || Capacitor.isNativePlatform()) {
    return;
  }

  await toggleScreenShare();
};

const handleToggleHandRaise = async () => {
  await toggleHandRaise();
};
</script>
