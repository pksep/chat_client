<template>
  <div
    class="call-modal__livekit-container call-modal__livekit-container--group"
    :class="{
      'call-modal__livekit-container--transparent': !isRemoteVideoActive
    }"
  >
    <div v-if="activeScreenShare" class="call-modal__screen-share-stage">
      <video
        :ref="setScreenShareVideoRef"
        autoplay
        playsinline
        class="call-modal__screen-share-video"
      ></video>
    </div>

    <div
      class="call-modal__remote-grid"
      :class="{
        'call-modal__remote-grid--screen-share': !!activeScreenShare,
        'call-modal__remote-grid--single': currentPageParticipantCount === 1,
        'call-modal__remote-grid--duo': currentPageParticipantCount === 2,
        'call-modal__remote-grid--group-duo': currentPageParticipantCount === 2,
        'call-modal__remote-grid--trio': currentPageParticipantCount === 3,
        'call-modal__remote-grid--quad':
          currentPageParticipantCount >= 3 && currentPageParticipantCount <= 4,
        'call-modal__remote-grid--six':
          currentPageParticipantCount >= 5 && currentPageParticipantCount <= 6,
        'call-modal__remote-grid--many': currentPageParticipantCount >= 7
      }"
    >
      <div
        v-for="participant in participants"
        :key="participant.identity"
        class="call-modal__remote-tile"
        :class="{ 'call-modal__remote-tile--local': participant.isLocal }"
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

    <div v-if="totalPages > 1" class="call-modal__pagination">
      <button
        class="call-modal__pagination-arrow"
        :disabled="currentPage === 0"
        @click="goToPage(currentPage - 1)"
      >
        <Icon :name="IconNameEnum.leftBig" />
      </button>
      <div class="call-modal__pagination-dots">
        <button
          v-for="page in totalPages"
          :key="page"
          class="call-modal__pagination-dot"
          :class="{
            'call-modal__pagination-dot--active': currentPage === page - 1
          }"
          @click="goToPage(page - 1)"
        ></button>
      </div>
      <button
        class="call-modal__pagination-arrow"
        :disabled="currentPage === totalPages - 1"
        @click="goToPage(currentPage + 1)"
      >
        <Icon :name="IconNameEnum.rightBig" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Avatar, Icon, IconNameEnum } from '@pksep/yui';
import { getConfig } from '../../services/useConfig';

const config = getConfig();

defineProps<{
  isRemoteVideoActive: boolean;
  activeScreenShare: {
    identity: string;
    name: string;
    isLocal: boolean;
  } | null;
  participants: Array<{
    identity: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isVideoActive: boolean;
    isLocal: boolean;
  }>;
  currentPage: number;
  currentPageParticipantCount: number;
  totalPages: number;
  goToPage: (page: number) => void;
  setScreenShareVideoRef: (el: Element | null) => void;
  setRemoteVideoRef: (identity: string, el: Element | null) => void;
  setRemoteAudioRef: (identity: string, el: Element | null) => void;
}>();
</script>
