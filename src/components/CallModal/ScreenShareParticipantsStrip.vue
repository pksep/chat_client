<template>
  <div class="call-modal__remote-grid-wrapper">
    <div
      class="call-modal__remote-grid-scroll call-modal__remote-grid-scroll--left"
      :class="{ 'call-modal__remote-grid-scroll--visible': canScrollLeft }"
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
          'call-modal__remote-tile--speaking': participant.isSpeaking,
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
        <ReactionVideoOverlay
          v-if="participant.activeReactionVideoSrc"
          :src="participant.activeReactionVideoSrc"
          :video-key="participant.activeReactionVideoKey"
          class-name="call-modal__remote-reaction-video"
        />
        <div
          v-if="!participant.isVideoActive"
          class="call-modal__remote-placeholder"
          :class="{
            'call-modal__remote-placeholder--background':
              !!participant.backgroundPlaceholderStyle
          }"
          :style="participant.backgroundPlaceholderStyle || undefined"
        >
          <CachedAvatar
            v-if="!participant.backgroundPlaceholderStyle"
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
          <span>{{ participant.name }}</span>
          <MicIcon v-if="participant.isMicActive" />
          <MicDisableIcon v-else />
        </div>
      </div>
    </div>

    <div
      class="call-modal__remote-grid-scroll call-modal__remote-grid-scroll--right"
      :class="{ 'call-modal__remote-grid-scroll--visible': canScrollRight }"
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
import type { CSSProperties } from 'vue';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import HandRaiseIcon from './UI/HandRaiseIcon.vue';
import MicDisableIcon from './UI/MicDisableIcon.vue';
import MicIcon from './UI/MicIcon.vue';
import ReactionVideoOverlay from './ReactionVideoOverlay.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';

const remoteGrid = ref<HTMLDivElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);
let remoteGridResizeObserver: ResizeObserver | null = null;

const emit = defineEmits<{
  (event: 'select-participant', identity: string | null): void;
}>();

const getScrollStep = (direction: 'left' | 'right') => {
  const remoteGridElement = remoteGrid.value;

  if (!remoteGridElement) {
    return 0;
  }

  const firstTile = remoteGridElement.querySelector(
    '.call-modal__remote-tile'
  ) as HTMLDivElement | null;

  const currentScroll = remoteGridElement.scrollLeft;

  const maxScroll =
    remoteGridElement.scrollWidth - remoteGridElement.clientWidth;

  let step = remoteGridElement.clientWidth;

  if (firstTile) {
    const tileWidth = firstTile.getBoundingClientRect().width;

    step = tileWidth * 3 + 24;
  }

  if (direction === 'right') {
    const remainingRight = maxScroll - currentScroll;

    if (remainingRight <= 500) {
      return remainingRight;
    }

    return step;
  }

  const remainingLeft = currentScroll;

  if (remainingLeft <= 500) {
    return remainingLeft;
  }

  return step;
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
  const step = getScrollStep(direction);

  remoteGrid.value?.scrollBy({
    left: direction === 'right' ? step : -step,
    behavior: 'smooth'
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
    activeReactionEmoji: string;
    activeReactionVideoSrc: string;
    activeReactionVideoKey: string;
    isSpeaking: boolean;
    isMicActive: boolean;
    hasAudio: boolean;
    backgroundPlaceholderStyle?: CSSProperties | null;
  }>;
  focusedParticipant: {
    identity: string;
    tileId: string;
    name: string;
    initials: string;
    avatarUrl: string;
    isHandRaised: boolean;
    activeReactionEmoji: string;
    activeReactionVideoSrc: string;
    activeReactionVideoKey: string;
    backgroundPlaceholderStyle?: CSSProperties | null;
  } | null;
  setRemoteVideoRef: (identity: string, el: Element | null) => void;
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
