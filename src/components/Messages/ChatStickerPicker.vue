<template>
  <Teleport v-if="enabled && groupsTarget" :to="groupsTarget">
    <button
      type="button"
      class="sticker-picker__tab"
      aria-label="Стикеры"
      title="Стикеры"
      :aria-pressed="active"
      @click.stop
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M19.5 13.5V7a3.5 3.5 0 0 0-3.5-3.5H8A3.5 3.5 0 0 0 4.5 7v10A3.5 3.5 0 0 0 8 20.5h4.5m7-7-7 7m7-7H16a3.5 3.5 0 0 0-3.5 3.5v3.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </Teleport>
  <Teleport v-if="active && bodyTarget" :to="bodyTarget">
    <section
      ref="scroller"
      class="chat-sticker-picker chat-scrollbar"
      aria-label="Каталог стикеров"
      @scroll.passive="handleScroll"
    >
      <div
        v-if="enabledPacks.length"
        class="chat-sticker-picker__packs"
        :class="{ 'chat-sticker-picker__packs--dragging': isPackDragging }"
        aria-label="Наборы стикеров"
        @wheel="handlePacksWheel"
        @pointerdown.stop="handlePacksPointerDown"
        @pointermove="handlePacksPointerMove"
        @pointerup="handlePacksPointerEnd"
        @pointercancel="handlePacksPointerEnd"
        @lostpointercapture="handlePacksPointerEnd"
        @click.capture="handlePacksClick"
      >
        <button
          type="button"
          :aria-pressed="selectedPack === 'recent'"
          @click.stop="choosePack('recent')"
        >
          Недавние
        </button>
        <button
          v-for="pack in enabledPacks"
          :key="pack.id"
          type="button"
          :aria-pressed="selectedPack === pack.id"
          @click.stop="choosePack(pack.id)"
        >
          <img
            class="chat-sticker-picker__pack-preview"
            :src="
              buildStickerAssetUrl(previewPaths[pack.id] || pack.previewPath)
            "
            alt=""
            width="16"
            height="16"
            draggable="false"
            decoding="async"
            @error="useFallbackPreview(pack)"
          />
          <span>{{ pack.label }}</span>
        </button>
      </div>
      <p v-if="error" class="chat-sticker-picker__state" role="alert">
        {{ error }}
        <button type="button" @click.stop="loadFirstPage">Повторить</button>
      </p>
      <div
        v-else
        class="chat-sticker-picker__grid"
        :style="{
          height: `${Math.ceil(items.length / columns) * rowHeight}px`
        }"
      >
        <button
          v-for="{ sticker, index, animate } in visibleItems"
          :key="`${sticker.id}:${sticker.version}`"
          type="button"
          class="chat-sticker-picker__item"
          :aria-label="`Отправить стикер: ${sticker.label}`"
          :title="sticker.label"
          :data-sticker-id="sticker.id"
          :style="{
            top: `${Math.floor(index / columns) * rowHeight}px`,
            left: `${(index % columns) * columnWidth + (columnWidth - 60) / 2}px`
          }"
          @click.stop="select(sticker)"
        >
          <StickerPickerImage :sticker="sticker" :animate="animate" />
        </button>
      </div>
      <p v-if="loading" class="chat-sticker-picker__state" role="status">
        Загрузка стикеров…
      </p>
      <p v-else-if="!items.length && !error" class="chat-sticker-picker__state">
        {{
          !enabledPacks.length
            ? 'Пока нет наборов стикеров'
            : selectedPack === 'recent' && !query
              ? 'Пока нет недавних стикеров'
              : 'Стикеры не найдены'
        }}
      </p>
    </section>
  </Teleport>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  watch
} from 'vue';
import {
  loadStickerPacks,
  loadStickerPage,
  loadRecentStickers,
  rememberSticker,
  type StickerPack
} from '../../services/sticker-catalog';
import StickerPickerImage from './StickerPickerImage.vue';
import '../../assets/chat-scrollbar.css';
import type { CatalogSticker } from '../../utils/stickers';
import { hiddenStickerPacks } from '../../services/sticker-preferences';
import {
  buildStickerAssetUrl,
  getStickerApiBaseUrl
} from '../../utils/sticker-assets';

// Адаптер сохраняет пикер и иконку публичной UI 0.1.332, заменяя только сетку стикеров.
const props = defineProps<{ host: HTMLElement | null; enabled: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const active = ref(false);
const bodyTarget = shallowRef<HTMLElement | null>(null);
const groupsTarget = shallowRef<HTMLElement | null>(null);
const scroller = ref<HTMLElement | null>(null);
const packs = ref<StickerPack[]>([]);
const previewPaths = ref<Record<string, string>>({});
const enabledPacks = computed(() =>
  packs.value.filter(pack => !hiddenStickerPacks.value.includes(pack.id))
);
const selectedPack = ref('');
const query = ref('');
const items = shallowRef<CatalogSticker[]>([]);
const loading = ref(false);
const error = ref('');
const nextCursor = ref<string | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(300);
const viewportWidth = ref(320);
const rowHeight = 70;
const columns = computed(() =>
  Math.max(1, Math.min(5, Math.floor(viewportWidth.value / 60)))
);
const columnWidth = computed(() => viewportWidth.value / columns.value);
const visibleItems = computed(() => {
  const first =
    Math.max(0, Math.floor(Math.max(0, scrollTop.value - 44) / rowHeight) - 2) *
    columns.value;
  const count =
    (Math.ceil(viewportHeight.value / rowHeight) + 5) * columns.value;
  return items.value.slice(first, first + count).map((sticker, offset) => {
    const index = first + offset;
    const top = 44 + Math.floor(index / columns.value) * rowHeight;
    return {
      sticker,
      index,
      animate:
        top + 60 > scrollTop.value &&
        top < scrollTop.value + viewportHeight.value
    };
  });
});
let wrapper: HTMLElement | null = null;
let abort: AbortController | null = null;
let requestId = 0;
let observer: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshPacks = true;
const isPackDragging = ref(false);
let suppressPackClick = false;
let packDrag: {
  pointerId: number;
  startX: number;
  scrollLeft: number;
  element: HTMLElement;
  captureTarget: HTMLElement;
} | null = null;

const resetPackDrag = () => {
  const previous = packDrag;
  packDrag = null;
  isPackDragging.value = false;
  if (previous?.captureTarget.hasPointerCapture(previous.pointerId))
    previous.captureTarget.releasePointerCapture(previous.pointerId);
};
const handlePacksPointerDown = (event: PointerEvent) => {
  suppressPackClick = false;
  if (
    event.pointerType === 'touch' ||
    !event.isPrimary ||
    event.button !== 0 ||
    !(event.currentTarget instanceof HTMLElement)
  )
    return;
  const element = event.currentTarget;
  if (element.scrollWidth <= element.clientWidth) return;
  resetPackDrag();
  const captureTarget =
    event.target instanceof HTMLElement ? event.target : element;
  packDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    scrollLeft: element.scrollLeft,
    element,
    captureTarget
  };
  captureTarget.setPointerCapture(event.pointerId);
};
const handlePacksPointerMove = (event: PointerEvent) => {
  if (!packDrag || packDrag.pointerId !== event.pointerId) return;
  const delta = event.clientX - packDrag.startX;
  if (!isPackDragging.value && Math.abs(delta) < 5) return;
  isPackDragging.value = true;
  event.preventDefault();
  packDrag.element.scrollLeft = packDrag.scrollLeft - delta;
};
const handlePacksPointerEnd = (event: PointerEvent) => {
  if (!packDrag || packDrag.pointerId !== event.pointerId) return;
  suppressPackClick = isPackDragging.value && event.type !== 'pointercancel';
  resetPackDrag();
};
const handlePacksClick = (event: MouseEvent) => {
  if (!suppressPackClick) return;
  suppressPackClick = false;
  if (event.detail === 0) return;
  event.preventDefault();
  event.stopPropagation();
};
const handlePacksWheel = (event: WheelEvent) => {
  if (
    event.ctrlKey ||
    event.metaKey ||
    !(event.currentTarget instanceof HTMLElement)
  )
    return;
  const element = event.currentTarget;
  if (element.scrollWidth <= element.clientWidth) return;
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.deltaY;
  if (!delta) return;
  const scale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? element.clientWidth
        : 1;
  event.preventDefault();
  event.stopPropagation();
  element.scrollLeft += delta * scale;
};
const useFallbackPreview = (pack: StickerPack) => {
  if (pack.messagePreviewPath && pack.messagePreviewPath !== pack.previewPath)
    previewPaths.value[pack.id] = pack.messagePreviewPath;
};

const loadFirstPage = async () => {
  const id = ++requestId;
  abort?.abort();
  abort = new AbortController();
  const signal = abort.signal;
  error.value = '';
  items.value = [];
  nextCursor.value = null;
  scrollTop.value = 0;
  if (scroller.value) scroller.value.scrollTop = 0;
  loading.value = true;
  try {
    if (refreshPacks || !packs.value.length) {
      packs.value = [];
      previewPaths.value = {};
      const result = await loadStickerPacks(signal);
      if (id !== requestId) return;
      packs.value = result.packs.filter(pack => pack.count > 0);
      refreshPacks = false;
    }
    if (!enabledPacks.value.length) return;
    if (
      selectedPack.value !== 'recent' &&
      !enabledPacks.value.some(pack => pack.id === selectedPack.value)
    )
      selectedPack.value = enabledPacks.value[0]?.id || 'recent';
    const page =
      selectedPack.value === 'recent' && !query.value
        ? {
            items: (await loadRecentStickers(signal)).filter(
              sticker => !hiddenStickerPacks.value.includes(sticker.pack)
            ),
            nextCursor: null
          }
        : await loadStickerPage(
            query.value ? '' : selectedPack.value,
            query.value,
            undefined,
            signal,
            hiddenStickerPacks.value
          );
    if (id !== requestId) return;
    items.value = page.items;
    nextCursor.value = page.nextCursor;
  } catch (reason) {
    if (id === requestId && !signal.aborted)
      error.value =
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить стикеры';
  } finally {
    if (id === requestId) loading.value = false;
  }
};

const loadNextPage = async () => {
  if (loading.value || !nextCursor.value || error.value) return;
  const id = requestId;
  const signal = abort?.signal;
  loading.value = true;
  try {
    const page = await loadStickerPage(
      query.value ? '' : selectedPack.value,
      query.value,
      nextCursor.value,
      signal,
      hiddenStickerPacks.value
    );
    if (id !== requestId) return;
    items.value = [...items.value, ...page.items];
    nextCursor.value = page.nextCursor;
  } catch (reason) {
    if (id === requestId && !signal?.aborted)
      error.value =
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить стикеры';
  } finally {
    if (id === requestId) loading.value = false;
  }
};
const handleScroll = () => {
  if (!scroller.value) return;
  scrollTop.value = scroller.value.scrollTop;
  if (
    scroller.value.scrollHeight -
      scrollTop.value -
      scroller.value.clientHeight <
    200
  )
    void loadNextPage();
};
const choosePack = (pack: string) => {
  selectedPack.value = pack;
  query.value = '';
  const search = wrapper?.querySelector<HTMLInputElement>('.v3-search input');
  if (search) {
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }
  clearTimeout(timer);
  void loadFirstPage();
};
const select = (sticker: CatalogSticker) => {
  rememberSticker(sticker);
  emit('select', sticker.id);
  wrapper?.closest<HTMLButtonElement>('.smile-button')?.click();
};
const deactivate = () => {
  resetPackDrag();
  suppressPackClick = false;
  active.value = false;
  wrapper?.classList.remove('chat-stickers--active');
  abort?.abort();
  requestId += 1;
  loading.value = false;
  clearTimeout(timer);
};
// Пикер вложен в кнопку UI: пробел и Enter не должны активировать её.
// Ввод пробела на keydown сохраняем, отменяя активацию внешней кнопки на keyup.
const handlePickerKey = (event: KeyboardEvent) => {
  if (event.key !== ' ' && event.key !== 'Enter') return;
  event.stopPropagation();
  if (
    event.target instanceof HTMLInputElement &&
    event.target.matches('.v3-search input') &&
    (event.key === 'Enter' || event.type === 'keyup')
  )
    event.preventDefault();
};
const handleSearchPointerDown = (event: PointerEvent) => {
  if (
    event.target instanceof HTMLInputElement &&
    event.target.matches('.v3-search input')
  ) {
    event.stopPropagation();
    event.target.focus({ preventScroll: true });
  }
};
const detachWrapper = () => {
  packs.value = [];
  previewPaths.value = {};
  items.value = [];
  wrapper?.classList.remove(
    'chat-stickers--active',
    'chat-stickers--available'
  );
  wrapper?.removeEventListener('keydown', handlePickerKey);
  wrapper?.removeEventListener('keyup', handlePickerKey);
  wrapper?.removeEventListener('pointerdown', handleSearchPointerDown, true);
  wrapper = null;
  bodyTarget.value = null;
  groupsTarget.value = null;
};
const syncWrapper = () => {
  const open = props.enabled
    ? [
        ...(props.host?.querySelectorAll<HTMLElement>('.emoji-picker--open') ||
          [])
      ].find(element => element.getClientRects().length > 0) || null
    : null;
  if (!open && active.value) deactivate();
  const target =
    open ||
    (props.enabled &&
    wrapper &&
    props.host?.contains(wrapper) &&
    wrapper.querySelector('.v3-groups')
      ? wrapper
      : null);
  if (wrapper !== target) {
    deactivate();
    detachWrapper();
    wrapper = target;
    selectedPack.value = '';
    refreshPacks = true;
    wrapper?.classList.add('chat-stickers--available');
    wrapper?.addEventListener('keydown', handlePickerKey);
    wrapper?.addEventListener('keyup', handlePickerKey);
    wrapper?.addEventListener('pointerdown', handleSearchPointerDown, true);
  }
  bodyTarget.value = wrapper?.querySelector<HTMLElement>('.v3-body') || null;
  groupsTarget.value =
    wrapper?.querySelector<HTMLElement>('.v3-groups') || null;
};
const click = (event: Event) => {
  if (!props.enabled || !(event.target instanceof Element)) return;
  syncWrapper();
  if (!wrapper || !bodyTarget.value) return;
  if (event.target.closest('.sticker-picker__tab')) {
    active.value = true;
    refreshPacks = true;
    wrapper.classList.add('chat-stickers--active');
    query.value =
      wrapper.querySelector<HTMLInputElement>('.v3-search input')?.value || '';
    void loadFirstPage();
  } else if (event.target.closest('.v3-groups .v3-group')) deactivate();
};
const input = (event: Event) => {
  if (
    !active.value ||
    !(event.target instanceof HTMLInputElement) ||
    !event.target.matches('.v3-search input')
  )
    return;
  query.value = event.target.value;
  abort?.abort();
  requestId += 1;
  loading.value = false;
  clearTimeout(timer);
  timer = setTimeout(() => void loadFirstPage(), 200);
};

watch(
  () => [props.host, props.enabled] as const,
  ([host, enabled], _previous, onCleanup) => {
    if (!host) return;
    host.toggleAttribute('data-chat-stickers-enabled', enabled);
    observer = new MutationObserver(syncWrapper);
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
    host.addEventListener('click', click, true);
    host.addEventListener('input', input, true);
    syncWrapper();
    onCleanup(() => {
      observer?.disconnect();
      host.removeAttribute('data-chat-stickers-enabled');
      host.removeEventListener('click', click, true);
      host.removeEventListener('input', input, true);
      deactivate();
      detachWrapper();
    });
  },
  { immediate: true }
);
watch(scroller, async element => {
  resizeObserver?.disconnect();
  if (!element) return;
  await nextTick();
  const measure = () => {
    viewportHeight.value = element.clientHeight;
    viewportWidth.value = element.clientWidth;
  };
  measure();
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(element);
});
watch(
  () => hiddenStickerPacks.value.join(','),
  () => {
    if (active.value) void loadFirstPage();
  }
);
watch(getStickerApiBaseUrl, () => {
  packs.value = [];
  previewPaths.value = {};
  refreshPacks = true;
  if (active.value) void loadFirstPage();
});
onBeforeUnmount(() => {
  deactivate();
  detachWrapper();
  observer?.disconnect();
  resizeObserver?.disconnect();
});
</script>

<style>
[data-chat-stickers-enabled] .v3-groups .v3-group:first-child {
  order: -2;
}
[data-chat-stickers-enabled]
  .v3-groups:not(:has(> .sticker-picker__tab))::before {
  content: '';
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  order: -1;
}
.chat-stickers--active .v3-body-inner,
.chat-stickers--active .v3-footer {
  display: none !important;
}
.chat-sticker-picker {
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--text-primary, #1c2535);
}
.chat-sticker-picker__packs {
  display: flex;
  gap: 5px;
  position: sticky;
  top: 0;
  z-index: 1;
  height: 44px;
  padding-bottom: 12px;
  overflow-x: auto;
  background: var(--surface-overlay, white);
  scrollbar-width: none;
  overscroll-behavior-x: contain;
  touch-action: pan-x;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
}
.chat-sticker-picker__packs button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  height: 32px;
  border: 1px solid var(--border-table, #e7e7e7);
  border-radius: 20px;
  padding: 5px 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}
.chat-sticker-picker__pack-preview {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  object-fit: contain;
  pointer-events: none;
}
.chat-sticker-picker__packs button[aria-pressed='true'] {
  border-color: var(--text-brand, #77a6ff);
  color: var(--text-brand, #3373e4);
}
.chat-sticker-picker__packs button:hover {
  background: var(--action-secondary-bg, #f8f9fd);
}
.chat-sticker-picker__packs--dragging,
.chat-sticker-picker__packs--dragging button {
  cursor: grabbing;
}
.chat-sticker-picker__grid {
  position: relative;
  width: 100%;
}
.chat-sticker-picker__item {
  position: absolute;
  display: grid;
  place-items: center;
  width: 60px;
  height: 60px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.chat-sticker-picker__item img {
  width: 60px;
  height: 60px;
  object-fit: contain;
}
.chat-sticker-picker__item:hover {
  background: var(--action-secondary-hover-bg, #f2f7ff);
}
.chat-sticker-picker button:focus-visible {
  outline: 2px solid var(--border-hover, #9cbeff);
  outline-offset: -2px;
}
.chat-sticker-picker__state {
  margin: 12px 0;
  font-size: 13px;
  text-align: center;
  color: var(--text-secondary, #757d8a);
}
</style>
