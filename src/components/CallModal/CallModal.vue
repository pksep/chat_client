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
      @click.stop="closeMobileCallActionsMenu"
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
          <button
            v-else
            class="call-modal__control-button call-modal__control-button--action call-modal__control-button--chevron-down"
            type="button"
            aria-label="Свернуть звонок"
            @click="hideModal"
          >
            <Icon :name="IconNameEnum.chevronDown" />
          </button>
          <div class="call-modal__group-info-text">
            <p>{{ resolvedGroupCallTitle }}</p>
            <span>{{ displayGroupCallMeta }}</span>
          </div>
        </div>

        <div
          v-if="isCallReconnectingNotice"
          class="call-modal__connection-status"
          role="status"
        >
          <span class="call-modal__connection-status-spinner"></span>
          <span>{{ callStatusNotice }}</span>
          <ErrorIcon class="call-modal__connection-status-alert" />
        </div>

        <div class="call-modal__group-actions">
          <button
            v-if="!isMobile"
            class="call-modal__control-button call-modal__control-button--action"
            @click="openGroupInfoPanel"
          >
            <GroupInfoIcon />
          </button>
          <div v-else class="call-modal__mobile-actions">
            <button
              class="call-modal__control-button call-modal__control-button--action"
              type="button"
              aria-label="Открыть меню звонка"
              @click.stop="toggleMobileCallActionsMenu"
            >
              <CallMoreIcon />
            </button>
            <div
              v-if="state.mobileCallActionsOpen"
              class="call-modal__mobile-actions-menu"
              @click.stop
            >
              <button
                class="call-modal__mobile-actions-item"
                type="button"
                :disabled="
                  isBusyNoticeVisible || isScreenShareUnavailableOnMobile
                "
                @click="handleMobileScreenShareAction"
              >
                <ScreenShareIcon />
                <span>{{
                  liveKitState.isScreenSharingActive
                    ? 'Выключить демонстрацию'
                    : 'Включить демонстрацию'
                }}</span>
              </button>
              <button
                class="call-modal__mobile-actions-item"
                type="button"
                disabled
              >
                <ScreenRecordIcon />
                <span>Включить запись экрана</span>
              </button>
              <button
                class="call-modal__mobile-actions-item"
                type="button"
                @click="handleOpenMobileCallSettings"
              >
                <GroupInfoIcon />
                <span>Настройки</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-show="showAvatarFallback"
        class="call-modal__avatar-container"
        :class="{
          'call-modal__avatar-container--ended': isEndedCallNotice
        }"
      >
        <h3
          v-if="displayAvatarInfo"
          class="call-modal__user-name"
          :class="{
            'call-modal__terminal-placeholder': isTerminalCallNotice
          }"
        >
          {{ displayAvatarTitle }}
        </h3>
        <p
          class="call-modal__status"
          :class="{
            'call-modal__terminal-placeholder': isTerminalCallNotice
          }"
        >
          <span v-if="isIncoming">{{ incomingCallLabel }}</span>
          <span v-else-if="isCalling">{{ connectingLabel }}</span>
          <span v-else>{{ formattedTime }}</span>
        </p>

        <p class="call-modal__notice">
          <span v-if="isTerminalCallNotice">
            {{ callStatusNotice }}
          </span>
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
        :can-stop-mobile-screen-share="
          isMobile && liveKitState.isScreenSharingActive
        "
        :is-busy-notice-visible="isBusyNoticeVisible"
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
        @toggle-screen-share="handleToggleScreenShare"
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
              :disabled="isBusyNoticeVisible"
              @click="acceptCall"
            >
              <LeaveIcon />
            </button>
            <button
              class="call-modal__control-button call-modal__control-button--reject"
              :disabled="isBusyNoticeVisible"
              @click="leaveCall"
            >
              <LeaveIcon />
            </button>
          </div>
        </template>
        <template v-else>
          <div
            class="call-modal__control-button-wrapper call-modal__control-button-wrapper--call-controls"
          >
            <div
              v-if="Capacitor.isNativePlatform()"
              class="call-modal__audio-output-picker"
            >
              <button
                class="call-modal__control-button call-modal__audio-output-button"
                :disabled="isBusyNoticeVisible"
                type="button"
                @click.stop="handleToggleAudioOutput('main')"
              >
                <component :is="audioOutputButtonIcon" active />
              </button>
              <div
                v-if="activeAudioOutputMenu === 'main'"
                class="call-modal__audio-output-menu"
                @click.stop
              >
                <button
                  v-for="option in audioOutputRouteOptions"
                  :key="option.route"
                  class="call-modal__audio-output-option"
                  type="button"
                  @click="handleSelectAudioOutputRoute(option.route)"
                >
                  <component :is="audioOutputRouteIcons[option.route]" />
                  <span>{{ option.label }}</span>
                </button>
              </div>
            </div>

            <button
              v-if="liveKitState.isMicActive"
              class="call-modal__control-button"
              :disabled="isBusyNoticeVisible"
              @click="handleToggleMic"
            >
              <MicIcon
                :audio-level="liveKitState.audioLevel"
                :is-speaking="liveKitState.isSpeaking"
              />
            </button>
            <button
              v-else
              class="call-modal__control-button call-modal__control-button__inactive"
              :disabled="isBusyNoticeVisible"
              @click="handleToggleMic"
            >
              <MicDisableIcon />
            </button>

            <button
              v-if="liveKitState.isVideoActive"
              class="call-modal__control-button"
              :disabled="isBusyNoticeVisible"
              @click="handleToggleVideo"
            >
              <VideoIcon />
            </button>
            <button
              v-else
              class="call-modal__control-button call-modal__control-button__inactive"
              :disabled="isBusyNoticeVisible"
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
              :disabled="isBusyNoticeVisible"
              @click="handleToggleScreenShare"
            >
              <ScreenShareIcon />
            </button>

            <button
              v-if="!isMobile"
              class="call-modal__control-button call-modal__control-button__inactive"
              type="button"
              disabled
            >
              <ScreenRecordIcon />
            </button>

            <div
              class="call-modal__reaction-picker"
              @mouseenter="handleReactionPickerMouseEnter('main')"
              @mouseleave="handleReactionPickerMouseLeave"
            >
              <div
                v-if="activeReactionPopover === 'main'"
                class="call-modal__reaction-popover"
                @mouseenter="handleReactionPickerMouseEnter('main')"
                @mouseleave="handleReactionPickerMouseLeave"
              >
                <button
                  v-for="option in callReactionOptions"
                  :key="option.reaction"
                  class="call-modal__reaction-option"
                  type="button"
                  :disabled="isBusyNoticeVisible"
                  :title="option.label"
                  :aria-label="option.label"
                  @click.stop="handleSendReaction(option.reaction)"
                >
                  <span v-emoji="{ animated: true }">{{ option.emoji }}</span>
                </button>
              </div>
              <button
                class="call-modal__control-button"
                :class="{
                  'call-modal__control-button__inactive':
                    !liveKitState.isHandRaised
                }"
                :disabled="isBusyNoticeVisible"
                @focus="handleReactionButtonFocus('main')"
                @blur="scheduleReactionPopoverClose"
                @touchstart="beginReactionLongPress('main')"
                @touchend="endReactionLongPress"
                @touchcancel="endReactionLongPress"
                @click="handleToggleHandRaise"
              >
                <HandRaiseIcon />
              </button>
            </div>

            <button
              class="call-modal__control-button call-modal__control-button--leave"
              @click="leaveCall"
            >
              <LeaveIcon />
            </button>
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="isStageVideoOverlayVisible && focusedParticipantHasVideo"
      :ref="setOverlayMediaGestureSurfaceRef"
      class="call-modal__video-overlay"
      @mousemove="handleVideoOverlayMouseMove"
      @mouseleave="videoOverlayRegion = null"
      @click.stop="closeMobileCallActionsMenu"
    >
      <video
        :ref="setOverlayFocusedParticipantVideoRef"
        autoplay
        playsinline
        muted
        class="call-modal__video-overlay-video call-modal__media-gesture-target"
        @click.stop="handleVideoOverlayTap"
      ></video>
      <ReactionVideoOverlay
        v-if="focusedGroupParticipant?.activeReactionVideoSrc"
        :src="focusedGroupParticipant.activeReactionVideoSrc"
        :video-key="focusedGroupParticipant.activeReactionVideoKey"
        class-name="call-modal__video-overlay-reaction"
      />

      <Transition name="call-modal-overlay-top">
        <div
          v-if="
            isCallFullscreenTouchMode
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

              <div
                v-if="isCallReconnectingNotice"
                class="call-modal__connection-status call-modal__connection-status--overlay"
                role="status"
              >
                <span class="call-modal__connection-status-spinner"></span>
                <span>{{ callStatusNotice }}</span>
                <ErrorIcon class="call-modal__connection-status-alert" />
              </div>

              <div class="call-modal__video-overlay-actions">
                <button
                  v-if="!isCallFullscreenTouchMode && !isMobile"
                  class="call-modal__control-button call-modal__control-button--action"
                  @click="openGroupInfoPanel"
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
            isCallFullscreenTouchMode
              ? isVideoOverlayControlsVisible
              : videoOverlayRegion === 'bottom'
          "
          class="call-modal__video-overlay-bar call-modal__video-overlay-bar--bottom"
          @click.stop
        >
          <div
            class="call-modal__control-button-wrapper call-modal__control-button-wrapper--call-controls"
          >
            <div
              v-if="Capacitor.isNativePlatform()"
              class="call-modal__audio-output-picker"
            >
              <button
                class="call-modal__control-button call-modal__audio-output-button"
                type="button"
                @click.stop="handleToggleAudioOutput('overlay')"
              >
                <component :is="audioOutputButtonIcon" active />
              </button>
              <div
                v-if="activeAudioOutputMenu === 'overlay'"
                class="call-modal__audio-output-menu"
                @click.stop
              >
                <button
                  v-for="option in audioOutputRouteOptions"
                  :key="option.route"
                  class="call-modal__audio-output-option"
                  type="button"
                  @click="handleSelectAudioOutputRoute(option.route)"
                >
                  <component :is="audioOutputRouteIcons[option.route]" />
                  <span>{{ option.label }}</span>
                </button>
              </div>
            </div>

            <button
              v-if="liveKitState.isMicActive"
              class="call-modal__control-button"
              @click="handleToggleMic"
            >
              <MicIcon
                :audio-level="liveKitState.audioLevel"
                :is-speaking="liveKitState.isSpeaking"
              />
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
              v-if="
                !isCallFullscreenTouchMode &&
                !isMobile &&
                !Capacitor.isNativePlatform()
              "
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
              v-if="!isCallFullscreenTouchMode && !isMobile"
              class="call-modal__control-button call-modal__control-button__inactive"
              type="button"
              disabled
            >
              <ScreenRecordIcon />
            </button>

            <div
              class="call-modal__reaction-picker"
              @mouseenter="handleReactionPickerMouseEnter('overlay')"
              @mouseleave="handleReactionPickerMouseLeave"
            >
              <div
                v-if="activeReactionPopover === 'overlay'"
                class="call-modal__reaction-popover"
                @mouseenter="handleReactionPickerMouseEnter('overlay')"
                @mouseleave="handleReactionPickerMouseLeave"
              >
                <button
                  v-for="option in callReactionOptions"
                  :key="option.reaction"
                  class="call-modal__reaction-option"
                  type="button"
                  :disabled="isBusyNoticeVisible"
                  :title="option.label"
                  :aria-label="option.label"
                  @click.stop="handleSendReaction(option.reaction)"
                >
                  <span v-emoji="{ animated: true }">{{ option.emoji }}</span>
                </button>
              </div>
              <button
                class="call-modal__control-button"
                :class="{
                  'call-modal__control-button__inactive':
                    !liveKitState.isHandRaised
                }"
                @focus="handleReactionButtonFocus('overlay')"
                @blur="scheduleReactionPopoverClose"
                @touchstart="beginReactionLongPress('overlay')"
                @touchend="endReactionLongPress"
                @touchcancel="endReactionLongPress"
                @click="handleToggleHandRaise"
              >
                <HandRaiseIcon />
              </button>
            </div>

            <button
              class="call-modal__control-button call-modal__control-button--leave"
              @click="leaveCall"
            >
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
    :show-open-chat="!!groupInfoTopic"
    :on-copy-link="copyInviteGroupCallLink"
    :on-open-chat="handleOpenGroupInfoChat"
    @close="state.openGroupInfoModal = false"
  />
  <div class="call-modal__reaction-preload" aria-hidden="true">
    <video
      v-for="src in reactionPreloadSources"
      :key="src"
      :src="src"
      preload="auto"
      muted
      playsinline
    ></video>
  </div>
</template>

<script setup lang="ts">
import {
  type Component,
  type CSSProperties,
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import { Capacitor } from '@capacitor/core';
import { MAX_W_MD } from '../../utils/constants';
import { useResizeState } from '../../composables/useResizeState';
import CachedAvatar from '../UI/CachedAvatar.vue';
import ErrorIcon from '../UI/ErrorIcon.vue';
import FullscreenIcon from './UI/FullscreenIcon.vue';
import MinimizeIcon from './UI/MinimizeIcon.vue';
import AudioOutputBluetoothIcon from './UI/AudioOutputBluetoothIcon.vue';
import AudioOutputPhoneIcon from './UI/AudioOutputPhoneIcon.vue';
import AudioOutputSpeakerIcon from './UI/AudioOutputSpeakerIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import VideoIcon from './UI/VideoIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import VideoDisableIcon from './UI/VideoDisableIcon.vue';
import LeaveIcon from './UI/LeaveIcon.vue';
import ScreenShareIcon from './UI/ScreenShareIcon.vue';
import ScreenRecordIcon from './UI/ScreenRecordIcon.vue';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import CallParticipantsPanel from './CallParticipantsPanel.vue';
import GroupCallLayout from './GroupCallLayout.vue';
import GroupCallInfoPanel from './GroupCallInfoPanel.vue';
import ReactionVideoOverlay from './ReactionVideoOverlay.vue';
import {
  activeScreenShare,
  acceptCall,
  copyInvitedGroupCallLink as copyInviteGroupCallLink,
  callStatusNotice,
  callStatusNoticeKind,
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
  refreshAudioOutputRoutes,
  sendCallReaction,
  selectAudioOutputRoute,
  state as liveKitState,
  toggleHandRaise,
  toggleMic,
  toggleScreenShare,
  switchCamera,
  toggleVideo,
  topicId as activeTopicId,
  updateRemoteVideoSubscription,
  user as activeUser
} from '../../services/useLiveKit';
import type { CallReaction } from '../../services/useLiveKit';
import type { AudioOutputRoute } from '../../services/useAudioOutput';
import {
  disableProximityLock,
  enableProximityLock
} from '../../services/useProximityLock';
import {
  allowCallFullscreenOrientation,
  hideIncomingCallScreen,
  lockPortraitOrientation,
  showIncomingCallScreen
} from '../../services/useCallScreen';
import { useCallBackground } from '../../composables/useCallBackground';
import { getUsersList } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';
import { useTopics } from '../../composables/useTopics';
import {
  navigateToDialogs,
  navigateToGroup
} from '../../composables/navigation';
import { TopicType } from '../../services/useChatSDK/types';
import { currentGroup, getGroupById } from '../../composables/useGroup';
import GroupInfoIcon from './UI/GroupInfoIcon.vue';
import CallMoreIcon from './UI/CallMoreIcon.vue';

const { state: isMobile } = useResizeState(MAX_W_MD);
const { getSelectedTopic } = useTopics();
const {
  callBackgroundPreviewItems,
  selectedCallBackgroundId,
  selectedCallBackgroundMode
} = useCallBackground();

const localVideo = ref<HTMLVideoElement | null>(null);
const screenShareVideo = ref<HTMLVideoElement | null>(null);
const focusedParticipantVideo = ref<HTMLVideoElement | null>(null);
const overlayFocusedParticipantVideo = ref<HTMLVideoElement | null>(null);
const overlayMediaGestureSurface = ref<HTMLElement | null>(null);
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
let focusedScreenShareFitCleanup: (() => void) | null = null;
let overlayMediaGestureCleanup: (() => void) | null = null;
let overlayMediaGestureBoundSurface: HTMLElement | null = null;
let overlayMediaGestureBoundVideo: HTMLVideoElement | null = null;
let overlayMediaGestureResetKey = '';

const MOBILE_SCREEN_SHARE_VIDEO_CLASS =
  'call-modal__screen-share-video--mobile';
const MOBILE_SCREEN_SHARE_MIN_ASPECT_RATIO = 1.9;
const MEDIA_GESTURE_ACTIVE_CLASS = 'call-modal__media-gesture-target--active';
const MEDIA_GESTURE_MIN_SCALE = 1;
const MEDIA_GESTURE_MAX_SCALE = 4;

const isAndroidNativePlatform = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

type MediaGesturePoint = {
  x: number;
  y: number;
};

type MediaGestureTransform = {
  scale: number;
  x: number;
  y: number;
};

const clampValue = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const getMediaGestureDistance = (
  first: MediaGesturePoint,
  second: MediaGesturePoint
): number => Math.hypot(second.x - first.x, second.y - first.y);

const getMediaGestureCenter = (
  first: MediaGesturePoint,
  second: MediaGesturePoint
) => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2
});

const clampMediaGestureTransform = (
  surface: HTMLElement,
  transform: MediaGestureTransform
): MediaGestureTransform => {
  const scale = clampValue(
    transform.scale,
    MEDIA_GESTURE_MIN_SCALE,
    MEDIA_GESTURE_MAX_SCALE
  );

  if (scale <= MEDIA_GESTURE_MIN_SCALE) {
    return { scale: MEDIA_GESTURE_MIN_SCALE, x: 0, y: 0 };
  }

  const maxX = (surface.clientWidth * (scale - 1)) / 2;
  const maxY = (surface.clientHeight * (scale - 1)) / 2;

  return {
    scale,
    x: clampValue(transform.x, -maxX, maxX),
    y: clampValue(transform.y, -maxY, maxY)
  };
};

const applyMediaGestureTransform = (
  element: HTMLElement,
  transform: MediaGestureTransform
) => {
  element.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
  element.classList.toggle(
    MEDIA_GESTURE_ACTIVE_CLASS,
    transform.scale > MEDIA_GESTURE_MIN_SCALE
  );
};

const resetMediaGestureTransform = (element: HTMLElement | null) => {
  if (!element) {
    return;
  }

  element.style.transform = '';
  element.classList.remove(MEDIA_GESTURE_ACTIVE_CLASS);
};

const getTouchGesturePoints = (touches: TouchList): MediaGesturePoint[] =>
  Array.from(touches, touch => ({
    x: touch.clientX,
    y: touch.clientY
  }));

const shouldIgnoreMediaGestureTarget = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  !!target.closest(
    'button, a, input, textarea, select, [role="button"], .call-modal__video-overlay-bar'
  );

const canHandleMediaGesture = (): boolean =>
  isAndroidNativePlatform() && isStageVideoOverlayVisible.value;

const bindMediaGestureTransform = (
  surface: HTMLElement | null,
  element: HTMLVideoElement | null
): (() => void) | null => {
  if (!surface || !element) {
    return null;
  }

  let transform: MediaGestureTransform = { scale: 1, x: 0, y: 0 };
  let startTransform: MediaGestureTransform = { ...transform };
  let startDistance = 0;
  let startCenter = { x: 0, y: 0 };
  let startPointer: MediaGesturePoint | null = null;
  let activeTouchCount = 0;
  let isGestureIgnored = false;
  let hasMovedDuringGesture = false;
  let lastTapAt = 0;
  let lastTapPoint: MediaGesturePoint | null = null;

  const updateTransform = (nextTransform: MediaGestureTransform) => {
    transform = clampMediaGestureTransform(surface, nextTransform);
    applyMediaGestureTransform(element, transform);
  };

  const resetGestureStart = (pointers: MediaGesturePoint[]) => {
    activeTouchCount = pointers.length;
    startTransform = { ...transform };

    if (pointers.length >= 2) {
      [startPointer] = pointers;
      startDistance = Math.max(
        getMediaGestureDistance(pointers[0], pointers[1]),
        1
      );
      startCenter = getMediaGestureCenter(pointers[0], pointers[1]);
      return;
    }

    startPointer = pointers[0] || null;
    startDistance = 0;
    startCenter = startPointer
      ? { x: startPointer.x, y: startPointer.y }
      : { x: 0, y: 0 };
  };

  const handleTouchStart = (event: TouchEvent) => {
    if (!canHandleMediaGesture()) {
      return;
    }

    if (activeTouchCount === 0) {
      isGestureIgnored = shouldIgnoreMediaGestureTarget(event.target);
      hasMovedDuringGesture = false;
    }

    if (isGestureIgnored) {
      return;
    }

    event.stopPropagation();

    if (event.touches.length > 1 || transform.scale > MEDIA_GESTURE_MIN_SCALE) {
      event.preventDefault();
    }

    resetGestureStart(getTouchGesturePoints(event.touches));
  };

  const handleTouchMove = (event: TouchEvent) => {
    if (
      isGestureIgnored ||
      !canHandleMediaGesture() ||
      activeTouchCount === 0
    ) {
      return;
    }

    event.stopPropagation();

    const pointers = getTouchGesturePoints(event.touches);

    if (pointers.length >= 2) {
      event.preventDefault();
      hasMovedDuringGesture = true;

      const distance = Math.max(
        getMediaGestureDistance(pointers[0], pointers[1]),
        1
      );
      const center = getMediaGestureCenter(pointers[0], pointers[1]);
      const nextScale = startTransform.scale * (distance / startDistance);

      updateTransform({
        scale: nextScale,
        x: startTransform.x + center.x - startCenter.x,
        y: startTransform.y + center.y - startCenter.y
      });
      return;
    }

    if (!startPointer || transform.scale <= MEDIA_GESTURE_MIN_SCALE) {
      return;
    }

    event.preventDefault();

    const currentPointer = pointers[0];
    const deltaX = currentPointer.x - startPointer.x;
    const deltaY = currentPointer.y - startPointer.y;

    if (Math.hypot(deltaX, deltaY) > 3) {
      hasMovedDuringGesture = true;
    }

    updateTransform({
      scale: transform.scale,
      x: startTransform.x + deltaX,
      y: startTransform.y + deltaY
    });
  };

  const handleTouchEnd = (event: TouchEvent) => {
    if (
      isGestureIgnored ||
      !canHandleMediaGesture() ||
      activeTouchCount === 0
    ) {
      return;
    }

    event.stopPropagation();

    const remainingPointers = getTouchGesturePoints(event.touches);

    if (remainingPointers.length > 0) {
      resetGestureStart(remainingPointers);
      return;
    }

    const endedPoint = event.changedTouches[0]
      ? {
          x: event.changedTouches[0].clientX,
          y: event.changedTouches[0].clientY
        }
      : null;
    const now = Date.now();
    const isDoubleTap =
      !hasMovedDuringGesture &&
      !!endedPoint &&
      !!lastTapPoint &&
      now - lastTapAt < 300 &&
      getMediaGestureDistance(endedPoint, lastTapPoint) < 40;

    if (isDoubleTap) {
      event.preventDefault();
      updateTransform(
        transform.scale > MEDIA_GESTURE_MIN_SCALE
          ? { scale: 1, x: 0, y: 0 }
          : { scale: 2, x: 0, y: 0 }
      );
      lastTapAt = 0;
      lastTapPoint = null;
    } else {
      lastTapAt = now;
      lastTapPoint = endedPoint;
    }

    activeTouchCount = 0;
    startPointer = null;
    startDistance = 0;
    startCenter = { x: 0, y: 0 };
    isGestureIgnored = false;
  };

  const handleTouchCancel = () => {
    activeTouchCount = 0;
    startPointer = null;
    startDistance = 0;
    startCenter = { x: 0, y: 0 };
    isGestureIgnored = false;
  };

  const handleResize = () => {
    updateTransform(transform);
  };

  const touchListenerOptions = { passive: false };
  surface.addEventListener(
    'touchstart',
    handleTouchStart,
    touchListenerOptions
  );
  surface.addEventListener('touchmove', handleTouchMove, touchListenerOptions);
  surface.addEventListener('touchend', handleTouchEnd, touchListenerOptions);
  surface.addEventListener('touchcancel', handleTouchCancel);
  window.addEventListener('resize', handleResize);
  resetMediaGestureTransform(element);

  return () => {
    surface.removeEventListener('touchstart', handleTouchStart);
    surface.removeEventListener('touchmove', handleTouchMove);
    surface.removeEventListener('touchend', handleTouchEnd);
    surface.removeEventListener('touchcancel', handleTouchCancel);
    window.removeEventListener('resize', handleResize);
    resetMediaGestureTransform(element);
  };
};

const bindOverlayMediaGestureTransform = () => {
  const surface = overlayMediaGestureSurface.value;
  const video = overlayFocusedParticipantVideo.value;

  if (
    overlayMediaGestureBoundSurface === surface &&
    overlayMediaGestureBoundVideo === video
  ) {
    return;
  }

  overlayMediaGestureCleanup?.();
  overlayMediaGestureCleanup = null;
  overlayMediaGestureBoundSurface = surface;
  overlayMediaGestureBoundVideo = video;

  if (!surface || !video) {
    return;
  }

  overlayMediaGestureCleanup = bindMediaGestureTransform(surface, video);
};

const isMobileScreenShareVideoSize = (video: HTMLVideoElement): boolean => {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    return false;
  }

  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);

  return (
    shortSide > 0 &&
    longSide / shortSide >= MOBILE_SCREEN_SHARE_MIN_ASPECT_RATIO
  );
};

const updateFocusedScreenShareFitClass = () => {
  const video = focusedParticipantVideo.value;
  const participant = focusedGroupParticipant.value as any;
  const isLocalAndroidScreenShare =
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android' &&
    !!participant?.isLocal;
  const isMobileScreenShare =
    !!participant?.isScreenShareActive &&
    (isLocalAndroidScreenShare ||
      (!!video && isMobileScreenShareVideoSize(video)));

  video?.classList.toggle(MOBILE_SCREEN_SHARE_VIDEO_CLASS, isMobileScreenShare);
};

const bindFocusedScreenShareFitClass = (video: HTMLVideoElement | null) => {
  focusedScreenShareFitCleanup?.();
  focusedScreenShareFitCleanup = null;

  if (!video) {
    return;
  }

  const update = () => updateFocusedScreenShareFitClass();

  video.addEventListener('loadedmetadata', update);
  video.addEventListener('resize', update);
  focusedScreenShareFitCleanup = () => {
    video.removeEventListener('loadedmetadata', update);
    video.removeEventListener('resize', update);
    video.classList.remove(MOBILE_SCREEN_SHARE_VIDEO_CLASS);
  };

  update();
};
const maxParticipantsPerPage = computed(() =>
  isMobile.value ? 4 : liveKitState.isFullScreen ? 9 : 6
);
const isScreenShareUnavailableOnMobile = computed(() => {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return false;
  }

  return (
    typeof navigator === 'undefined' ||
    !window.isSecureContext ||
    typeof navigator.mediaDevices?.getDisplayMedia !== 'function'
  );
});
const state = ref({
  openGroupInfoModal: false,
  mobileCallActionsOpen: false
});
const activeReactionPopover = ref<'main' | 'overlay' | null>(null);
const activeAudioOutputMenu = ref<'main' | 'overlay' | null>(null);
let reactionPopoverCloseTimeout: ReturnType<typeof setTimeout> | null = null;
let reactionLongPressTimeout: ReturnType<typeof setTimeout> | null = null;
let didOpenReactionPopoverByLongPress = false;
let lastReactionTouchAt = 0;
const incomingCallLabel = 'Входящий вызов...';
const connectingLabel = 'Соединение...';
const singleParticipantLabel = 'участник';
const fewParticipantsLabel = 'участника';
const manyParticipantsLabel = 'участников';
const callLabel = 'Звонок';
const groupCallLabel = 'Групповой звонок';
type SelectableAudioOutputRoute = Exclude<AudioOutputRoute, 'auto'>;
const audioOutputRouteOrder: SelectableAudioOutputRoute[] = [
  'earpiece',
  'speaker',
  'bluetooth'
];
const audioOutputRouteLabels: Record<SelectableAudioOutputRoute, string> = {
  bluetooth: 'Bluetooth-устройства',
  earpiece: 'Телефон',
  speaker: 'Динамик'
};
const audioOutputRouteIcons = {
  bluetooth: AudioOutputBluetoothIcon,
  earpiece: AudioOutputPhoneIcon,
  speaker: AudioOutputSpeakerIcon
} satisfies Record<SelectableAudioOutputRoute, Component>;
const audioOutputButtonIcon = computed(
  () => audioOutputRouteIcons[liveKitState.audioOutputRoute]
);
const audioOutputRouteOptions = computed(() =>
  audioOutputRouteOrder
    .filter(route => liveKitState.audioOutputAvailableRoutes.includes(route))
    .map(route => ({
      route,
      label: audioOutputRouteLabels[route]
    }))
);
const participantOrder = ref<string[]>([]);
const callReactionOptions: Array<{
  reaction: CallReaction;
  emoji: string;
  label: string;
}> = [
  {
    reaction: 'heart',
    emoji: '❤️',
    label: 'Heart'
  },
  {
    reaction: 'thumbs-up',
    emoji: '👍',
    label: 'Thumbs up'
  },
  {
    reaction: 'thumbs-down',
    emoji: '👎',
    label: 'Thumbs down'
  },
  {
    reaction: 'joy',
    emoji: '😂',
    label: 'Joy'
  },
  {
    reaction: 'sob',
    emoji: '😭',
    label: 'Sob'
  }
];

const getCallReactionEmoji = (reaction?: CallReaction | null) =>
  callReactionOptions.find(option => option.reaction === reaction)?.emoji || '';

const callReactionVideoSources: Record<CallReaction, string> = {
  heart: '/video/heart-fullscreen-zoomlike-transparent.webm',
  joy: '/video/joy-fullscreen-zoomlike-transparent.webm',
  sob: '/video/sob-fullscreen-zoomlike-transparent.webm',
  'thumbs-up': '/video/thumbs-up-fullscreen-zoomlike-transparent.webm',
  'thumbs-down': '/video/thumbs-down-fullscreen-zoomlike-transparent.webm'
};

const getCallReactionVideoSrc = (reaction?: CallReaction | null) =>
  reaction ? callReactionVideoSources[reaction] || '' : '';
const reactionPreloadSources = Object.values(callReactionVideoSources);
let remoteVideoResizeObserver: ResizeObserver | null = null;
let observedRemoteVideoBindings = new Map<
  HTMLVideoElement,
  { identity: string; streamKind: 'camera' | 'screen' }
>();

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

const syncRemoteVideoSubscriptionPreference = (
  participant:
    | {
        identity: string;
        isLocal: boolean;
        isVideoActive: boolean;
        streamKind: string;
      }
    | null
    | undefined,
  element: HTMLVideoElement | null
) => {
  if (
    !participant ||
    !element ||
    participant.isLocal ||
    !participant.isVideoActive ||
    (participant.streamKind !== 'camera' && participant.streamKind !== 'screen')
  ) {
    return;
  }

  const source = participant.streamKind === 'screen' ? 'screen' : 'camera';

  updateRemoteVideoSubscription(participant.identity, source, element);
};

const rebuildRemoteVideoSubscriptionBindings = () => {
  remoteVideoResizeObserver?.disconnect();
  observedRemoteVideoBindings = new Map();

  const bindVideo = (
    participant:
      | {
          identity: string;
          isLocal: boolean;
          isVideoActive: boolean;
          streamKind: string;
        }
      | null
      | undefined,
    element: HTMLVideoElement | null
  ) => {
    if (
      !participant ||
      !element ||
      participant.isLocal ||
      !participant.isVideoActive ||
      (participant.streamKind !== 'camera' &&
        participant.streamKind !== 'screen')
    ) {
      return;
    }

    const source = participant.streamKind === 'screen' ? 'screen' : 'camera';

    observedRemoteVideoBindings.set(element, {
      identity: participant.identity,
      streamKind: source
    });
    remoteVideoResizeObserver?.observe(element);
    syncRemoteVideoSubscriptionPreference(participant, element);
  };

  remoteParticipantViews.value.forEach(participant => {
    bindVideo(participant, remoteVideoRefs.value[participant.tileId]);
    bindVideo(participant, overlayRemoteVideoRefs.value[participant.tileId]);
  });

  bindVideo(
    focusedGroupParticipant.value as any,
    focusedParticipantVideo.value
  );
  bindVideo(
    focusedGroupParticipant.value as any,
    overlayFocusedParticipantVideo.value
  );
};

const scheduleRemoteVideoSubscriptionSync = () => {
  void nextTick().then(rebuildRemoteVideoSubscriptionBindings);
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
    activeReactionEmoji: getCallReactionEmoji(participant.activeReaction),
    activeReactionVideoSrc: participant.activeReaction
      ? getCallReactionVideoSrc(participant.activeReaction)
      : '',
    activeReactionVideoKey:
      participant.activeReaction && participant.activeReactionExpiresAt
        ? `${participant.activeReaction}-${participant.activeReactionExpiresAt}`
        : '',
    isSpeaking: participant.isSpeaking,
    audioLevel: participant.audioLevel || 0,
    isMicActive: participant.isMicActive,
    connectionQuality: participant.connectionQuality || 'unknown',
    backgroundPlaceholderStyle: participant.backgroundPlaceholderStyle || null
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
    currentCallTopic.value?.type === TopicType.Group ||
    !!invitedGroupCall.value ||
    remoteParticipants.value.length > 1
);

const displayUser = computed(() => {
  if (isGroupCallLayout.value) {
    return (getAuthUser() as any) || (activeUser.value as any);
  }

  return activeUser.value as any;
});

const resolveAvatarInitials = (
  value?: string | null,
  fallback = 'G'
): string => {
  const normalizedValue = (value || '').trim();

  if (!normalizedValue) {
    return fallback;
  }

  const parts = normalizedValue
    .split(/\s+/)
    .map(part => part[0] || '')
    .filter(Boolean)
    .slice(0, 2);

  if (!parts.length) {
    return fallback;
  }

  return parts.join('').toUpperCase();
};

const displayAvatarInfo = computed(() => {
  if (isGroupCallLayout.value) {
    const groupName = resolvedGroupCallTitle.value || groupCallLabel;
    return {
      name: groupName,
      initials: resolveAvatarInitials(groupName),
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

const displayAvatarTitle = computed(() =>
  isGroupCallLayout.value
    ? displayAvatarInfo.value?.name || groupCallLabel
    : displayAvatarInfo.value?.initials || ''
);
const isCallReconnectingNotice = computed(
  () =>
    !!callStatusNotice.value && callStatusNoticeKind.value === 'reconnecting'
);
const isTerminalCallNotice = computed(
  () =>
    !!callStatusNotice.value && callStatusNoticeKind.value !== 'reconnecting'
);
const isEndedCallNotice = computed(
  () => !!callStatusNotice.value && callStatusNoticeKind.value === 'ended'
);
const isBusyNoticeVisible = computed(() => isTerminalCallNotice.value);
const localCallBackgroundPlaceholderStyle = computed<CSSProperties | null>(
  () => {
    if (
      !liveKitState.isVideoActive ||
      !!localVideoStream.value ||
      selectedCallBackgroundMode.value === 'none'
    ) {
      return null;
    }

    return (
      callBackgroundPreviewItems.value.find(
        item => item.id === selectedCallBackgroundId.value
      )?.previewStyle || null
    );
  }
);

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
      activeReaction: liveKitState.activeReaction,
      activeReactionExpiresAt: liveKitState.activeReactionExpiresAt,
      isSpeaking: liveKitState.isSpeaking,
      audioLevel: liveKitState.audioLevel,
      isMicActive: liveKitState.isMicActive,
      connectionQuality: liveKitState.connectionQuality,
      backgroundPlaceholderStyle: localCallBackgroundPlaceholderStyle.value
    },
    {
      initials: authUser.initials || 'Y',
      avatarUrl: authUser.avatarUrl || ''
    },
    true
  );
});

const localParticipantDisplayViews = computed(() => {
  const entries = localParticipantView.value || [];

  if (entries.length) {
    return entries;
  }

  const authUser = getAuthUser() as any;

  if (!authUser) {
    return [];
  }

  return buildParticipantEntries(
    {
      identity: authUser.id,
      name: authUser.initials || authUser.nickname || 'You',
      cameraStream: null,
      screenShareStream: null,
      videoStream: null,
      audioStream: null,
      isVideoActive: false,
      isHandRaised: liveKitState.isHandRaised,
      activeReaction: liveKitState.activeReaction,
      activeReactionExpiresAt: liveKitState.activeReactionExpiresAt,
      isSpeaking: liveKitState.isSpeaking,
      audioLevel: liveKitState.audioLevel,
      isMicActive: liveKitState.isMicActive,
      connectionQuality: liveKitState.connectionQuality,
      backgroundPlaceholderStyle: localCallBackgroundPlaceholderStyle.value
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
  ...localParticipantDisplayViews.value
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

      return !!participant?.isHandRaised && !participant.isScreenShareActive;
    }),
    ...nextOrder.filter(participantId => {
      const participant = participantMap.get(participantId);

      return (
        !!participant?.isSpeaking &&
        !participant.isScreenShareActive &&
        !participant.isHandRaised
      );
    }),
    ...nextOrder.filter(participantId => {
      const participant = participantMap.get(participantId);

      return (
        (!!participant?.activeReactionEmoji ||
          !!participant?.activeReactionVideoSrc) &&
        !participant.isScreenShareActive &&
        !participant.isSpeaking &&
        !participant.isHandRaised
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
const focusedParticipantStageMediaKey = computed(() => {
  const participant = focusedGroupParticipant.value as any;

  if (!participant) {
    return '';
  }

  const mediaType = participant.isScreenShareActive ? 'screen' : 'camera';

  return `${participant.tileId}:${mediaType}`;
});
const focusedParticipantHasVideo = computed(
  () => !!focusedParticipantStageStream.value
);
const isCallFullscreenTouchMode = computed(
  () => isAndroidNativePlatform() && isStageVideoOverlayVisible.value
);
const shouldAllowCallFullscreenOrientation = computed(
  () =>
    isAndroidNativePlatform() &&
    isStageVideoOverlayVisible.value &&
    focusedParticipantHasVideo.value
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
const groupInfoTopic = computed(() => {
  const resolvedTopicId =
    activeTopicId.value || invitedGroupCall.value?.topicId;

  if (!resolvedTopicId) {
    return null;
  }

  return (getSelectedTopic(resolvedTopicId) as any) || null;
});
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
  () =>
    isCallOpen.value &&
    !isIncoming.value &&
    !isCalling.value &&
    !isTerminalCallNotice.value
);

const showAvatarFallback = computed(
  () => isIncoming.value || isCalling.value || isTerminalCallNotice.value
);

watch(
  [screenShareVideo, activeScreenShare],
  ([video, screenShare]) => {
    syncMediaElementStream(video, screenShare?.stream || null);
    if (screenShare) {
      updateRemoteVideoSubscription(screenShare.identity, 'screen', video);
    }
  },
  { immediate: true }
);

watch(
  [focusedParticipantVideo, focusedParticipantStageStream],
  ([video, stream]) => {
    syncMediaElementStream(video, stream);
    syncRemoteVideoSubscriptionPreference(
      focusedGroupParticipant.value as any,
      video
    );
    updateFocusedScreenShareFitClass();
  },
  { immediate: true }
);

watch(
  focusedGroupParticipant,
  () => {
    updateFocusedScreenShareFitClass();
  },
  { immediate: true }
);

watch(
  [
    overlayFocusedParticipantVideo,
    focusedParticipantStageStream,
    focusedParticipantStageMediaKey
  ],
  ([video, stream, mediaKey]) => {
    if (!video) {
      overlayMediaGestureResetKey = '';
    } else if (mediaKey !== overlayMediaGestureResetKey) {
      resetMediaGestureTransform(video);
      overlayMediaGestureResetKey = mediaKey;
    }

    syncMediaElementStream(video, stream);
    syncRemoteVideoSubscriptionPreference(
      focusedGroupParticipant.value as any,
      video
    );
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
        syncRemoteVideoSubscriptionPreference(participant, video);
      }

      if (overlayVideo) {
        syncMediaElementStream(overlayVideo, participant.videoStream);
        syncRemoteVideoSubscriptionPreference(participant, overlayVideo);
      }

      if (audio && participant.hasAudio) {
        syncMediaElementStream(audio, participant.audioStream);
      }
    });

    scheduleRemoteVideoSubscriptionSync();
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
      participants.find(
        participant => participant.isScreenShareActive && !participant.isLocal
      ) || null;

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
  [focusedGroupParticipant, isStageVideoOverlayVisible],
  () => {
    scheduleRemoteVideoSubscriptionSync();
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

    scheduleRemoteVideoSubscriptionSync();
  },
  { immediate: true }
);

watch(
  shouldAllowCallFullscreenOrientation,
  allowOrientationChange => {
    if (allowOrientationChange) {
      void allowCallFullscreenOrientation();
      return;
    }

    void lockPortraitOrientation();
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
    scheduleRemoteVideoSubscriptionSync();
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

watch(
  [isCallOpen, isIncoming, isCalling, () => liveKitState.audioOutputRoute],
  ([open, incoming]) => {
    if (open) {
      showIncomingCallScreen();

      if (!incoming) {
        if (liveKitState.audioOutputRoute === 'earpiece') {
          enableProximityLock();
        } else {
          disableProximityLock();
        }
      }
    } else {
      closeAudioOutputMenu();
      hideIncomingCallScreen();
      disableProximityLock();
    }
  }
);

watch(
  () => liveKitState.audioOutputAvailableRoutes.includes('bluetooth'),
  hasBluetoothRoute => {
    if (!hasBluetoothRoute) {
      closeAudioOutputMenu();
    }
  }
);

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    remoteVideoResizeObserver = new ResizeObserver(entries => {
      entries.forEach(entry => {
        const binding = observedRemoteVideoBindings.get(
          entry.target as HTMLVideoElement
        );

        if (!binding) {
          return;
        }

        updateRemoteVideoSubscription(
          binding.identity,
          binding.streamKind,
          entry.target as HTMLVideoElement
        );
      });
    });
  }

  scheduleRemoteVideoSubscriptionSync();
});

onBeforeUnmount(() => {
  remoteVideoResizeObserver?.disconnect();
  remoteVideoResizeObserver = null;
  observedRemoteVideoBindings = new Map();
  focusedScreenShareFitCleanup?.();
  focusedScreenShareFitCleanup = null;
  overlayMediaGestureCleanup?.();
  overlayMediaGestureCleanup = null;
  overlayMediaGestureBoundSurface = null;
  overlayMediaGestureBoundVideo = null;
  void lockPortraitOrientation();
});

const setScreenShareVideoRef = (el: Element | null) => {
  screenShareVideo.value = el as HTMLVideoElement | null;
  syncMediaElementStream(
    screenShareVideo.value,
    activeScreenShare.value?.stream || null
  );
  if (activeScreenShare.value) {
    updateRemoteVideoSubscription(
      activeScreenShare.value.identity,
      'screen',
      screenShareVideo.value
    );
  }
  scheduleRemoteVideoSubscriptionSync();
};

const setFocusedParticipantVideoRef = (el: Element | null) => {
  const video = el as HTMLVideoElement | null;

  if (focusedParticipantVideo.value === video) {
    return;
  }

  focusedParticipantVideo.value = video;
  bindFocusedScreenShareFitClass(focusedParticipantVideo.value);
  syncMediaElementStream(
    focusedParticipantVideo.value,
    focusedParticipantStageStream.value
  );
  syncRemoteVideoSubscriptionPreference(
    focusedGroupParticipant.value as any,
    focusedParticipantVideo.value
  );
  scheduleRemoteVideoSubscriptionSync();
};

const setOverlayFocusedParticipantVideoRef = (el: Element | null) => {
  const video = el as HTMLVideoElement | null;

  if (overlayFocusedParticipantVideo.value === video) {
    return;
  }

  overlayFocusedParticipantVideo.value = video;
  bindOverlayMediaGestureTransform();
  syncMediaElementStream(
    overlayFocusedParticipantVideo.value,
    focusedParticipantStageStream.value
  );
  syncRemoteVideoSubscriptionPreference(
    focusedGroupParticipant.value as any,
    overlayFocusedParticipantVideo.value
  );
  scheduleRemoteVideoSubscriptionSync();
};

const setOverlayMediaGestureSurfaceRef = (el: Element | null) => {
  const surface = el as HTMLElement | null;

  if (overlayMediaGestureSurface.value === surface) {
    return;
  }

  overlayMediaGestureSurface.value = surface;
  bindOverlayMediaGestureTransform();
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
    syncRemoteVideoSubscriptionPreference(participant, el as HTMLVideoElement);
  }

  scheduleRemoteVideoSubscriptionSync();
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
    syncRemoteVideoSubscriptionPreference(participant, el as HTMLVideoElement);
  }

  scheduleRemoteVideoSubscriptionSync();
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

  closeMobileCallActionsMenu();
  isStageVideoOverlayVisible.value = true;
  isVideoOverlayControlsVisible.value = false;
  videoOverlayRegion.value = isAndroidNativePlatform() ? null : 'top';
};

const closeStageVideoOverlay = () => {
  closeMobileCallActionsMenu();
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
  if (isCallFullscreenTouchMode.value || isMobile.value) {
    return;
  }

  videoOverlayRegion.value = getVideoOverlayRegion(event.clientY);
};

const handleVideoOverlayTap = () => {
  if (!isCallFullscreenTouchMode.value && !isMobile.value) {
    return;
  }

  closeMobileCallActionsMenu();
  isVideoOverlayControlsVisible.value = !isVideoOverlayControlsVisible.value;
};

const hideModal = () => {
  if (isBusyNoticeVisible.value) {
    return;
  }

  closeMobileCallActionsMenu();

  if (!isIncoming.value) {
    isCallModalVisible.value = false;
  }
};

const closeMobileCallActionsMenu = () => {
  state.value.mobileCallActionsOpen = false;
};

const closeAudioOutputMenu = () => {
  activeAudioOutputMenu.value = null;
};

const toggleMobileCallActionsMenu = () => {
  if (isBusyNoticeVisible.value) {
    return;
  }

  closeAudioOutputMenu();
  state.value.mobileCallActionsOpen = !state.value.mobileCallActionsOpen;
};

const handleToggleAudioOutput = async (target: 'main' | 'overlay') => {
  if (isBusyNoticeVisible.value) {
    return;
  }

  closeReactionPopover();
  closeMobileCallActionsMenu();

  if (activeAudioOutputMenu.value === target) {
    closeAudioOutputMenu();
    return;
  }

  const audioState = await refreshAudioOutputRoutes();
  const hasBluetoothRoute =
    audioState?.availableRoutes.includes('bluetooth') ||
    liveKitState.audioOutputAvailableRoutes.includes('bluetooth');

  if (!hasBluetoothRoute) {
    closeAudioOutputMenu();
    await selectAudioOutputRoute(
      liveKitState.audioOutputRoute === 'speaker' ? 'earpiece' : 'speaker'
    );
    return;
  }

  activeAudioOutputMenu.value = target;
};

const handleSelectAudioOutputRoute = async (
  route: SelectableAudioOutputRoute
) => {
  await selectAudioOutputRoute(route);
  closeAudioOutputMenu();
};

const openGroupInfoPanel = () => {
  closeMobileCallActionsMenu();
  closeAudioOutputMenu();
  state.value.openGroupInfoModal = true;
};

const handleOpenMobileCallSettings = () => {
  openGroupInfoPanel();
};

const handleOpenGroupInfoChat = (): boolean => {
  const topic = groupInfoTopic.value;

  if (!topic?.id) {
    return false;
  }

  if (topic.type === TopicType.Group) {
    navigateToGroup(topic.id);
  } else {
    navigateToDialogs(topic.id);
  }

  state.value.openGroupInfoModal = false;
  isCallModalVisible.value = false;

  return true;
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
  if (isScreenShareUnavailableOnMobile.value) {
    return;
  }

  await toggleScreenShare();
};

const handleMobileScreenShareAction = async () => {
  closeMobileCallActionsMenu();
  await handleToggleScreenShare();
};

const clearReactionPopoverCloseTimeout = () => {
  if (reactionPopoverCloseTimeout) {
    clearTimeout(reactionPopoverCloseTimeout);
    reactionPopoverCloseTimeout = null;
  }
};

const clearReactionLongPressTimeout = () => {
  if (reactionLongPressTimeout) {
    clearTimeout(reactionLongPressTimeout);
    reactionLongPressTimeout = null;
  }
};

const hasRecentReactionTouch = () => Date.now() - lastReactionTouchAt < 800;

const openReactionPopover = (target: 'main' | 'overlay') => {
  if (isBusyNoticeVisible.value) {
    return;
  }

  clearReactionPopoverCloseTimeout();
  activeReactionPopover.value = target;
};

const scheduleReactionPopoverClose = () => {
  clearReactionPopoverCloseTimeout();
  reactionPopoverCloseTimeout = setTimeout(() => {
    activeReactionPopover.value = null;
    reactionPopoverCloseTimeout = null;
  }, 120);
};

const closeReactionPopover = () => {
  clearReactionPopoverCloseTimeout();
  clearReactionLongPressTimeout();
  activeReactionPopover.value = null;
};

const handleReactionButtonFocus = (target: 'main' | 'overlay') => {
  if (isMobile.value) {
    return;
  }

  openReactionPopover(target);
};

const handleReactionPickerMouseEnter = (target: 'main' | 'overlay') => {
  if (isMobile.value || hasRecentReactionTouch()) {
    return;
  }

  openReactionPopover(target);
};

const handleReactionPickerMouseLeave = () => {
  if (isMobile.value || hasRecentReactionTouch()) {
    return;
  }

  scheduleReactionPopoverClose();
};

const beginReactionLongPress = (target: 'main' | 'overlay') => {
  if (!isMobile.value || isBusyNoticeVisible.value) {
    return;
  }

  lastReactionTouchAt = Date.now();
  clearReactionLongPressTimeout();
  didOpenReactionPopoverByLongPress = false;
  reactionLongPressTimeout = setTimeout(() => {
    didOpenReactionPopoverByLongPress = true;
    openReactionPopover(target);
    reactionLongPressTimeout = null;
  }, 550);
};

const endReactionLongPress = () => {
  lastReactionTouchAt = Date.now();
  clearReactionLongPressTimeout();
};

const handleSendReaction = async (reaction: CallReaction) => {
  await sendCallReaction(reaction);
  didOpenReactionPopoverByLongPress = false;
  closeReactionPopover();
};

const handleToggleHandRaise = async () => {
  if (isMobile.value && didOpenReactionPopoverByLongPress) {
    didOpenReactionPopoverByLongPress = false;
    return;
  }

  await toggleHandRaise();
};
</script>
