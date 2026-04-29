<template>
  <div class="call-modal__remote-grid-wrapper">
    <div
      v-if="canScrollLeft"
      class="call-modal__remote-grid-scroll call-modal__remote-grid-scroll--left"
    >
      <button
        class="call-modal__pagination-arrow"
        type="button"
        @click.stop="scrollParticipantsLeft"
      >
        <Icon :name="IconNameEnum.leftBig" />
      </button>
    </div>

    <div
      ref="remoteGrid"
      class="call-modal__remote-grid call-modal__remote-grid--screen-share"
      @scroll="updateScrollState"
    >
      <div
        v-for="participant in participants"
        :key="participant.tileId"
        class="call-modal__remote-tile"
        :class="{
          'call-modal__remote-tile--local': participant.isLocal,
          'call-modal__remote-tile--active':
            focusedParticipant?.tileId === participant.tileId
        }"
        @click="emit('select-participant', participant.tileId)"
      >
        <video
          v-show="participant.isVideoActive"
          :ref="el => setRemoteVideoRef(participant.tileId, el as Element)"
          autoplay
          playsinline
          class="call-modal__remote-video"
        ></video>
        <audio
          v-if="participant.hasAudio"
          :ref="el => setRemoteAudioRef(participant.identity, el as Element)"
          autoplay
        ></audio>
        <div
          v-if="!participant.isVideoActive"
          class="call-modal__remote-placeholder"
        >
          <CachedAvatar
            :path="participant.avatarUrl"
            :alt="participant.name"
            class="call-modal__avatar"
            :initials="participant.initials"
          />
        </div>
        <div
          v-if="participant.isHandRaised"
          class="call-modal__remote-hand"
          :title="`${participant.name} raised a hand`"
        >
          <HandRaiseIcon />
        </div>
        <div class="call-modal__remote-name">
          {{ participant.name }}
          <MicIcon v-if="participant.isMicActive" />
          <MicDisableIcon v-else />
        </div>
      </div>
    </div>

    <div
      v-if="canScrollRight"
      class="call-modal__remote-grid-scroll call-modal__remote-grid-scroll--right"
    >
      <button
        class="call-modal__pagination-arrow"
        type="button"
        @click.stop="scrollParticipantsRight"
      >
        <Icon :name="IconNameEnum.rightBig" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';

const remoteGrid = ref<HTMLDivElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let remoteGridResizeObserver: ResizeObserver | null = null;

const emit = defineEmits<{
  (event: 'select-participant', identity: string | null): void;
}>();

const getScrollStep = () => {
  const remoteGridElement = remoteGrid.value;

  if (!remoteGridElement) {
    return 0;
  }

  const firstTile = remoteGridElement.querySelector(
    '.call-modal__remote-tile'
  ) as HTMLDivElement | null;

  if (!firstTile) {
    return remoteGridElement.clientWidth;
  }

  const tileWidth = firstTile.getBoundingClientRect().width;

  return tileWidth * 3;
};

const updateScrollState = () => {
  const remoteGridElement = remoteGrid.value;

  if (!remoteGridElement) {
    canScrollLeft.value = false;
    canScrollRight.value = false;
    return;
  }

  const maxScrollLeft =
    remoteGridElement.scrollWidth - remoteGridElement.clientWidth;

  canScrollLeft.value = remoteGridElement.scrollLeft > 4;
  canScrollRight.value = maxScrollLeft - remoteGridElement.scrollLeft > 4;
};

const scrollParticipants = (direction: 'left' | 'right') => {
  const step = getScrollStep();

  remoteGrid.value?.scrollBy({
    left: direction === 'right' ? step : -step
  });
};

const scrollParticipantsLeft = () => {
  scrollParticipants('left');
};

const scrollParticipantsRight = () => {
  scrollParticipants('right');
};

const props = defineProps<{
  participants: Array<{
    identity: string;
    tileId: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isVideoActive: boolean;
    isLocal: boolean;
    isHandRaised: boolean;
    isSpeaking: boolean;
    isMicActive: boolean;
    hasAudio: boolean;
  }>;
  focusedParticipant: {
    identity: string;
    tileId: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isHandRaised: boolean;
  } | null;
  setRemoteVideoRef: (identity: string, el: Element | null) => void;
  setRemoteAudioRef: (identity: string, el: Element | null) => void;
}>();

watch(
  () => props.participants.map(participant => participant.tileId).join('|'),
  async () => {
    await nextTick();
    updateScrollState();
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('resize', updateScrollState);
  if (typeof ResizeObserver !== 'undefined' && remoteGrid.value) {
    remoteGridResizeObserver = new ResizeObserver(() => {
      updateScrollState();
    });
    remoteGridResizeObserver.observe(remoteGrid.value);
  }
  void nextTick().then(updateScrollState);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateScrollState);
  remoteGridResizeObserver?.disconnect();
  remoteGridResizeObserver = null;
});
</script>
