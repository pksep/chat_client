<template>
  <Teleport v-if="enabled" :to="modeTarget || 'body'" :disabled="!modeTarget">
    <div
      v-show="!!modeTarget"
      ref="modeControl"
      class="chat-sticker-picker__mode"
      data-testid="StickerPickerMode"
      role="group"
      aria-label="Выбор эмодзи или стикеров"
      @click.stop
      @pointerdown.stop
      @keydown="handleModeKey"
    >
      <button
        v-for="(mode, index) in modeItems"
        :key="mode.value"
        type="button"
        class="chat-sticker-picker__mode-button"
        :aria-pressed="active === (index === 1)"
        @click="chooseMode(mode.value)"
      >
        <Icon
          v-if="mode.value === 'emoji'"
          :name="IconNameEnum.smile"
          :width="16"
          :height="16"
          aria-hidden="true"
        />
        <svg
          v-else
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M9.5 14H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5.5L9.5 14Z"
            stroke="currentColor"
            stroke-linejoin="round"
          />
          <path
            d="M9.5 14v-3a1.5 1.5 0 0 1 1.5-1.5h3"
            stroke="currentColor"
            stroke-linejoin="round"
          />
        </svg>
        {{ mode.label }}
      </button>
    </div>
  </Teleport>
  <Teleport
    v-if="enabled && prepared"
    :to="bodyTarget || 'body'"
    :disabled="!bodyTarget"
  >
    <section
      ref="scroller"
      class="chat-sticker-picker chat-scrollbar"
      :class="{ 'chat-sticker-picker--preparing': !isVisible }"
      :aria-hidden="!isVisible"
      :inert="!isVisible"
      aria-label="Каталог стикеров"
      @scroll.passive="handleScroll"
    >
      <div
        v-if="enabledPacks.length"
        ref="packRail"
        class="chat-sticker-picker__packs"
        :style="packRailStyle"
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
          aria-label="Недавние"
          title="Недавние"
          class="chat-sticker-picker__recent"
          @click.stop="choosePack('recent')"
        >
          <img
            :src="recentIconSrc"
            alt=""
            width="30"
            height="30"
            draggable="false"
          />
        </button>
        <button
          v-for="pack in enabledPacks"
          :key="pack.id"
          type="button"
          :aria-pressed="selectedPack === pack.id"
          :aria-label="pack.label"
          :title="pack.label"
          @click.stop="choosePack(pack.id)"
        >
          <StickerPackImage
            class="chat-sticker-picker__pack-preview"
            :thumbnail="pack.thumbnail"
            :preview-path="previewPaths[pack.id] || pack.previewPath"
            :label="pack.label"
            :playing="active"
            @error="useFallbackPreview(pack)"
          />
        </button>
      </div>
      <div
        v-if="items.length || !error"
        class="chat-sticker-picker__grid"
        :style="{
          height: `${gridHeight}px`
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
            left: `${(index % columns) * columnWidth + (columnWidth - itemSize) / 2}px`,
            width: `${itemSize}px`,
            height: `${itemSize}px`,
            '--sticker-display-size': `${itemSize}px`
          }"
          @pointerdown="startStickerHold($event, sticker)"
          @contextmenu.prevent.stop
          @click.stop="select(sticker, $event)"
        >
          <StickerPickerImage :sticker="sticker" :animate="animate" preload />
        </button>
      </div>
      <p v-if="error" class="chat-sticker-picker__state" role="alert">
        {{ error }}
        <button type="button" @click.stop="retryLoad">Повторить</button>
      </p>
      <p
        v-if="loading && !items.length"
        class="chat-sticker-picker__state"
        role="status"
      >
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
  <StickerPreview
    v-if="previewSticker"
    :sticker="previewSticker"
    @close="closeStickerPreview"
  />
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch
} from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import {
  loadStickerPacks,
  loadStickerPage,
  loadRecentStickers,
  rememberSticker,
  StickerPageExpiredError,
  type StickerPack
} from '../../services/sticker-catalog';
import StickerPickerImage from './StickerPickerImage.vue';
import StickerPackImage from './StickerPackImage.vue';
import StickerPreview from './StickerPreview.vue';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';
import '../../assets/chat-scrollbar.css';
import type { CatalogSticker } from '../../utils/stickers';
import {
  hiddenStickerPacks,
  orderStickerPacks
} from '../../services/sticker-preferences';
import { getStickerApiBaseUrl } from '../../utils/sticker-assets';

// Адаптер сохраняет пикер и иконку публичной UI 0.1.332, заменяя только сетку стикеров.
const props = defineProps<{ host: HTMLElement | null; enabled: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const active = ref(false);
const prepared = ref(false);
const bodyTarget = shallowRef<HTMLElement | null>(null);
// Первый клик может прийти раньше загрузки контейнера панели из UI-kit.
const isVisible = computed(() => active.value && !!bodyTarget.value);
const headerTarget = shallowRef<HTMLElement | null>(null);
const modeTarget = shallowRef<HTMLElement | null>(null);
const modeControl = ref<HTMLElement | null>(null);
const packRail = ref<HTMLElement | null>(null);
const packRailStyle = ref<Record<string, string>>({});
const recentIconSrc = ref('');
const modeItems = [
  { label: 'Эмодзи', value: 'emoji' },
  { label: 'Стикеры', value: 'stickers' }
];
const scroller = ref<HTMLElement | null>(null);
const packs = ref<StickerPack[]>([]);
const previewPaths = ref<Record<string, string>>({});
const messagePack = ref('');
const enabledPacks = computed(() =>
  orderStickerPacks(packs.value).filter(
    pack =>
      !hiddenStickerPacks.value.includes(pack.id) ||
      pack.id === messagePack.value
  )
);
const excludedPacks = computed(() =>
  hiddenStickerPacks.value.filter(pack => pack !== messagePack.value)
);
const selectedPack = ref('');
const query = ref('');
const items = shallowRef<CatalogSticker[]>([]);
const loading = ref(false);
const error = ref('');
const failedPage = ref<'first' | 'next'>('first');
const nextCursor = ref<string | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(300);
const viewportWidth = ref(320);
const columns = computed(() =>
  Math.max(1, Math.min(5, Math.floor(viewportWidth.value / 60)))
);
const columnWidth = computed(() => viewportWidth.value / columns.value);
const rows = computed(() => Math.ceil(items.value.length / columns.value));
// Маленький набор помещается целиком; у последнего ряда нет лишнего нижнего отступа.
const compact = computed(() => items.value.length <= 15 && !nextCursor.value);
const itemSize = computed(() =>
  Math.max(
    1,
    Math.min(
      60,
      columnWidth.value,
      compact.value && rows.value
        ? Math.floor(viewportHeight.value / rows.value)
        : 60
    )
  )
);
const rowHeight = computed(() =>
  compact.value && rows.value > 1
    ? Math.min(70, (viewportHeight.value - itemSize.value) / (rows.value - 1))
    : 70
);
const gridHeight = computed(() =>
  rows.value ? (rows.value - 1) * rowHeight.value + itemSize.value : 0
);
const visibleItems = computed(() => {
  const first =
    Math.max(0, Math.floor(scrollTop.value / rowHeight.value) - 2) *
    columns.value;
  const count =
    (Math.ceil(viewportHeight.value / rowHeight.value) + 5) * columns.value;
  return items.value.slice(first, first + count).map((sticker, offset) => {
    const index = first + offset;
    const top = Math.floor(index / columns.value) * rowHeight.value;
    return {
      sticker,
      index,
      animate:
        active.value &&
        top + itemSize.value > scrollTop.value &&
        top < scrollTop.value + viewportHeight.value
    };
  });
});
let wrapper: HTMLElement | null = null;
let abort: AbortController | null = null;
let requestId = 0;
let observer: MutationObserver | null = null;
let resizeObserver: ResizeObserver | null = null;
let packResizeObserver: ResizeObserver | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshPacks = true;
let loadedPageKey = '';
let loadedPageTotal = 0;
let loadedPageRevision: string | undefined;
let pendingPack = '';
let pickerWasOpen = false;
const previewSticker = shallowRef<CatalogSticker | null>(null);
let holdTimer: ReturnType<typeof setTimeout> | undefined;
let suppressStickerClick = false;
let stickerHold: {
  pointerId: number;
  x: number;
  y: number;
  target: HTMLElement;
} | null = null;
const closeStickerPreview = () => {
  clearTimeout(holdTimer);
  const previous = stickerHold;
  stickerHold = null;
  if (previewSticker.value) suppressStickerClick = true;
  previewSticker.value = null;
  if (previous?.target.hasPointerCapture(previous.pointerId))
    previous.target.releasePointerCapture(previous.pointerId);
  document.removeEventListener('pointermove', moveStickerHold, true);
  document.removeEventListener('pointerup', endStickerHold, true);
  document.removeEventListener('pointercancel', endStickerHold, true);
  document.removeEventListener('keydown', handlePreviewKey, true);
  window.removeEventListener('blur', closeStickerPreview);
};
const handlePreviewKey = (event: KeyboardEvent) => {
  if (!previewSticker.value || event.key !== 'Escape') return;
  event.preventDefault();
  event.stopPropagation();
  closeStickerPreview();
};
const moveStickerHold = (event: PointerEvent) => {
  if (!stickerHold || event.pointerId !== stickerHold.pointerId) return;
  if (previewSticker.value) {
    event.preventDefault();
    event.stopPropagation();
  } else if (
    Math.hypot(event.clientX - stickerHold.x, event.clientY - stickerHold.y) > 8
  )
    closeStickerPreview();
};
const endStickerHold = (event: PointerEvent) => {
  if (!stickerHold || event.pointerId !== stickerHold.pointerId) return;
  if (previewSticker.value) {
    event.preventDefault();
    event.stopPropagation();
  }
  closeStickerPreview();
};
const startStickerHold = (event: PointerEvent, sticker: CatalogSticker) => {
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    !(event.currentTarget instanceof HTMLElement)
  )
    return;
  // Не передаём удержание внешней кнопке эмодзи: она вызывает фокус редактора.
  event.stopPropagation();
  event.preventDefault();
  closeStickerPreview();
  suppressStickerClick = false;
  stickerHold = {
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    target: event.currentTarget
  };
  document.addEventListener('pointermove', moveStickerHold, true);
  document.addEventListener('pointerup', endStickerHold, true);
  document.addEventListener('pointercancel', endStickerHold, true);
  document.addEventListener('keydown', handlePreviewKey, true);
  window.addEventListener('blur', closeStickerPreview);
  holdTimer = setTimeout(() => {
    if (!stickerHold || !active.value || !stickerHold.target.isConnected)
      return;
    previewSticker.value = sticker;
    stickerHold.target.setPointerCapture(stickerHold.pointerId);
  }, 400);
};
useBackButtonHandler(
  () => !!previewSticker.value,
  closeStickerPreview,
  BackButtonPriority.overlay
);
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
  failedPage.value = 'first';
  const pageKey = () =>
    JSON.stringify([
      getStickerApiBaseUrl(),
      selectedPack.value,
      query.value,
      excludedPacks.value
    ]);
  const clearPage = () => {
    items.value = [];
    nextCursor.value = null;
    loadedPageKey = '';
    loadedPageTotal = 0;
    scrollTop.value = 0;
    if (scroller.value) scroller.value.scrollTop = 0;
  };
  if (loadedPageKey !== pageKey()) {
    items.value = [];
    nextCursor.value = null;
    scrollTop.value = 0;
    if (scroller.value) scroller.value.scrollTop = 0;
  }
  loading.value = true;
  try {
    const refreshing = refreshPacks || !packs.value.length;
    const refresh = refreshing
      ? loadStickerPacks(signal)
          .then(result => {
            if (id !== requestId) return;
            packs.value = result.packs.filter(pack => pack.count > 0);
            if (!enabledPacks.value.length) clearPage();
            refreshPacks = false;
            return result;
          })
          .catch(reason => {
            if (id === requestId && !signal.aborted && !packs.value.length)
              error.value =
                reason instanceof Error
                  ? reason.message
                  : 'Не удалось загрузить стикеры';
            return undefined;
          })
      : undefined;
    // Обновление каталога не убирает уже готовые обложки и кадры.
    if (!packs.value.length) await refresh;
    if (id !== requestId) return;
    if (!enabledPacks.value.length) {
      clearPage();
      return;
    }
    if (
      selectedPack.value !== 'recent' &&
      !enabledPacks.value.some(pack => pack.id === selectedPack.value)
    )
      selectedPack.value = enabledPacks.value[0]?.id || 'recent';
    const key = pageKey();
    if (loadedPageKey !== key) {
      items.value = [];
      nextCursor.value = null;
    }
    const pageRequest =
      selectedPack.value === 'recent' && !query.value
        ? loadRecentStickers(signal).then(recent => ({
            items: recent.filter(
              sticker => !excludedPacks.value.includes(sticker.pack)
            ),
            nextCursor: null,
            total: recent.length,
            revision: undefined
          }))
        : loadStickerPage(
            query.value ? '' : selectedPack.value,
            query.value,
            undefined,
            signal,
            excludedPacks.value
          );
    const page = await pageRequest;
    if (id !== requestId) return;
    if (!enabledPacks.value.length) {
      clearPage();
      return;
    }
    const unchanged =
      loadedPageKey === key &&
      loadedPageRevision === page.revision &&
      loadedPageTotal === page.total &&
      page.items.every((sticker, index) => {
        const previous = items.value[index];
        return (
          previous?.id === sticker.id &&
          previous.version === sticker.version &&
          previous.path === sticker.path
        );
      });
    if (!unchanged || items.value.length <= page.items.length) {
      items.value = page.items;
      nextCursor.value = page.nextCursor;
      if (!unchanged && scrollTop.value > gridHeight.value) {
        scrollTop.value = 0;
        if (scroller.value) scroller.value.scrollTop = 0;
      }
    }
    loadedPageKey = key;
    loadedPageTotal = page.total;
    loadedPageRevision = page.revision;
    void refresh?.then(catalog => {
      if (id !== requestId || signal.aborted || !catalog) return;
      if (
        (catalog.revision &&
          page.revision &&
          catalog.revision !== page.revision) ||
        (selectedPack.value !== 'recent' &&
          !enabledPacks.value.some(pack => pack.id === selectedPack.value))
      )
        void loadFirstPage();
    });
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
      excludedPacks.value
    );
    if (id !== requestId) return;
    items.value = [...items.value, ...page.items];
    nextCursor.value = page.nextCursor;
  } catch (reason) {
    if (id === requestId && !signal?.aborted) {
      if (reason instanceof StickerPageExpiredError) {
        await loadFirstPage();
        return;
      }
      failedPage.value = 'next';
      error.value =
        reason instanceof Error
          ? reason.message
          : 'Не удалось загрузить стикеры';
    }
  } finally {
    if (id === requestId) loading.value = false;
  }
};
const retryLoad = () => {
  error.value = '';
  void (failedPage.value === 'next' ? loadNextPage() : loadFirstPage());
};
const handleScroll = () => {
  if (!previewSticker.value) closeStickerPreview();
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
  closeStickerPreview();
  if (pack !== messagePack.value) messagePack.value = '';
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
const select = (sticker: CatalogSticker, event: MouseEvent) => {
  if (previewSticker.value || (suppressStickerClick && event.detail !== 0)) {
    suppressStickerClick = false;
    return;
  }
  rememberSticker(sticker);
  emit('select', sticker.id);
  wrapper?.closest<HTMLButtonElement>('.smile-button')?.click();
};
const deactivate = () => {
  closeStickerPreview();
  messagePack.value = '';
  resetPackDrag();
  suppressPackClick = false;
  active.value = false;
  wrapper?.classList.remove('chat-stickers--active');
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
  wrapper?.classList.remove(
    'chat-stickers--active',
    'chat-stickers--available'
  );
  wrapper?.removeEventListener('keydown', handlePickerKey);
  wrapper?.removeEventListener('keyup', handlePickerKey);
  wrapper?.removeEventListener('pointerdown', handleSearchPointerDown, true);
  wrapper = null;
  bodyTarget.value = null;
  headerTarget.value = null;
  modeTarget.value = null;
};
const syncWrapper = () => {
  const open = props.enabled
    ? [
        ...(props.host?.querySelectorAll<HTMLElement>('.emoji-picker--open') ||
          [])
      ].find(element => element.getClientRects().length > 0) || null
    : null;
  if (!open && pickerWasOpen) pendingPack = '';
  pickerWasOpen = !!open;
  if (!open && active.value && !pendingPack) deactivate();
  const target =
    open ||
    (props.enabled &&
    wrapper &&
    props.host?.contains(wrapper) &&
    wrapper.querySelector('.v3-groups')
      ? wrapper
      : null);
  if (wrapper !== target) {
    if (!pendingPack) deactivate();
    detachWrapper();
    wrapper = target;
    refreshPacks = true;
    wrapper?.addEventListener('keydown', handlePickerKey);
    wrapper?.addEventListener('keyup', handlePickerKey);
    wrapper?.addEventListener('pointerdown', handleSearchPointerDown, true);
  }
  // UI обновляет class при повторном открытии, поэтому восстанавливаем классы адаптера.
  if (wrapper && !wrapper.classList.contains('chat-stickers--available'))
    wrapper.classList.add('chat-stickers--available');
  if (
    wrapper &&
    wrapper.classList.contains('chat-stickers--active') !== active.value
  )
    wrapper.classList.toggle('chat-stickers--active', active.value);
  bodyTarget.value = wrapper?.querySelector<HTMLElement>('.v3-body') || null;
  headerTarget.value =
    wrapper?.querySelector<HTMLElement>('.v3-header') || null;
  modeTarget.value =
    wrapper?.querySelector<HTMLElement>('.v3-emoji-picker') || null;
  recentIconSrc.value =
    wrapper?.querySelector<HTMLImageElement>(
      '.v3-header .v3-groups .v3-group:first-child img'
    )?.src || '';
  // В мобильной сборке содержимое пикера появляется после асинхронного импорта.
  if (open && bodyTarget.value && headerTarget.value && pendingPack) {
    const pack = pendingPack;
    pendingPack = '';
    void showPack(pack);
  }
};
const chooseMode = (mode: string) => {
  pendingPack = '';
  if (mode === 'emoji') {
    deactivate();
    return;
  }
  if (!props.enabled || !wrapper || !bodyTarget.value || active.value) return;
  prepared.value = true;
  active.value = true;
  refreshPacks = true;
  wrapper.classList.add('chat-stickers--active');
  query.value =
    wrapper.querySelector<HTMLInputElement>('.v3-search input')?.value || '';
  void loadFirstPage();
};
const handleModeKey = (event: KeyboardEvent) => {
  if (!(event.target instanceof HTMLElement)) return;
  const items = [
    ...(modeControl.value?.querySelectorAll<HTMLButtonElement>(
      '.chat-sticker-picker__mode-button'
    ) || [])
  ];
  const index = items.indexOf(
    event.target.closest('button') as HTMLButtonElement
  );
  if (index < 0) return;
  let target = index;
  if (event.key === 'ArrowRight' || event.key === 'End') target = 1;
  else if (event.key === 'ArrowLeft' || event.key === 'Home') target = 0;
  else if (event.key !== ' ' && event.key !== 'Enter') return;
  event.preventDefault();
  event.stopPropagation();
  chooseMode(modeItems[target].value);
  items[target].focus({ preventScroll: true });
};
const click = (event: Event) => {
  if (!props.enabled || !(event.target instanceof Element)) return;
  syncWrapper();
  if (!wrapper || !bodyTarget.value) return;
  // Инициализация UI сама нажимает «Недавние»; это не выбор режима пользователем.
  if (event.isTrusted && event.target.closest('.v3-groups .v3-group'))
    deactivate();
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

const showPack = async (pack: string) => {
  if (!wrapper || !bodyTarget.value) return;
  messagePack.value = pack;
  prepared.value = true;
  active.value = true;
  wrapper.classList.add('chat-stickers--active');
  refreshPacks = true;
  selectedPack.value = pack;
  query.value = '';
  const search = wrapper.querySelector<HTMLInputElement>('.v3-search input');
  if (search) {
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }
  clearTimeout(timer);
  await loadFirstPage();
  await nextTick();
  if (!active.value || selectedPack.value !== pack) return;
  const selected = scroller.value?.querySelector<HTMLElement>(
    '.chat-sticker-picker__packs button[aria-pressed="true"]'
  );
  const rail = selected?.parentElement;
  if (selected && rail) {
    const itemBounds = selected.getBoundingClientRect();
    const railBounds = rail.getBoundingClientRect();
    if (itemBounds.left < railBounds.left)
      rail.scrollLeft -= railBounds.left - itemBounds.left;
    else if (itemBounds.right > railBounds.right)
      rail.scrollLeft += itemBounds.right - railBounds.right;
  }
};
const openPack = async (pack: string) => {
  if (!props.enabled || !props.host || pack === 'keyboard') return;
  const host = props.host;
  pendingPack = pack;
  // Режим выбирается до открытия UI, включая первый асинхронный рендер.
  prepared.value = true;
  messagePack.value = pack;
  selectedPack.value = pack;
  query.value = '';
  active.value = true;
  const isOpen = [
    ...host.querySelectorAll<HTMLElement>('.emoji-picker--open')
  ].some(element => element.getClientRects().length > 0);
  if (!isOpen) {
    const trigger = [
      ...host.querySelectorAll<HTMLElement>('.smile-button')
    ].find(element => element.getClientRects().length > 0);
    if (!trigger) {
      pendingPack = '';
      deactivate();
      return;
    }
    trigger.click();
  }
  await nextTick();
  if (host !== props.host || !props.enabled) return;
  syncWrapper();
};
const prepare = (pack?: string) => {
  if (!props.enabled || active.value) return;
  if (prepared.value && (!pack || pack === selectedPack.value)) return;
  prepared.value = true;
  if (pack && pack !== 'keyboard') {
    messagePack.value = pack;
    selectedPack.value = pack;
  }
  void loadFirstPage();
};
defineExpose({ openPack, prepare });

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
      pendingPack = '';
      pickerWasOpen = false;
      observer?.disconnect();
      host.removeAttribute('data-chat-stickers-enabled');
      host.removeEventListener('click', click, true);
      host.removeEventListener('input', input, true);
      deactivate();
      detachWrapper();
      abort?.abort();
      requestId += 1;
      prepared.value = false;
      packs.value = [];
      previewPaths.value = {};
      items.value = [];
      selectedPack.value = '';
      loadedPageKey = '';
      loadedPageTotal = 0;
    });
  },
  { immediate: true }
);
watch([scroller, isVisible], async ([element]) => {
  resizeObserver?.disconnect();
  if (!element) return;
  await nextTick();
  const measure = () => {
    if (!isVisible.value) return;
    viewportHeight.value = element.clientHeight;
    viewportWidth.value = element.clientWidth;
  };
  measure();
  resizeObserver = new ResizeObserver(measure);
  resizeObserver.observe(element);
});
watch([packRail, headerTarget, active], async ([element]) => {
  packResizeObserver?.disconnect();
  if (!element) return;
  await nextTick();
  const groups = headerTarget.value?.querySelector<HTMLElement>('.v3-groups');
  const parent = element.offsetParent;
  if (!groups || !(parent instanceof HTMLElement)) return;
  const measure = () => {
    const bounds = groups.getBoundingClientRect();
    const origin = parent.getBoundingClientRect();
    packRailStyle.value = {
      top: `${bounds.top - origin.top - parent.clientTop}px`,
      left: `${bounds.left - origin.left - parent.clientLeft}px`,
      width: `${bounds.width}px`
    };
  };
  measure();
  packResizeObserver = new ResizeObserver(measure);
  packResizeObserver.observe(groups);
});
watch(
  () => hiddenStickerPacks.value.join(','),
  () => {
    if (active.value) void loadFirstPage();
  }
);
watch(getStickerApiBaseUrl, () => {
  abort?.abort();
  requestId += 1;
  packs.value = [];
  previewPaths.value = {};
  refreshPacks = true;
  loadedPageKey = '';
  loadedPageTotal = 0;
  items.value = [];
  if (prepared.value) void loadFirstPage();
});
const recoverCatalog = () => {
  if (active.value && error.value && !loading.value && !document.hidden)
    retryLoad();
};
onMounted(() => {
  window.addEventListener('online', recoverCatalog);
  window.addEventListener('focus', recoverCatalog);
  document.addEventListener('visibilitychange', recoverCatalog);
});
onBeforeUnmount(() => {
  window.removeEventListener('online', recoverCatalog);
  window.removeEventListener('focus', recoverCatalog);
  document.removeEventListener('visibilitychange', recoverCatalog);
  pendingPack = '';
  deactivate();
  detachWrapper();
  abort?.abort();
  requestId += 1;
  observer?.disconnect();
  resizeObserver?.disconnect();
  packResizeObserver?.disconnect();
});
</script>

<style>
[data-chat-stickers-enabled]
  .v3-emoji-picker:not(:has(> .chat-sticker-picker__mode))::after {
  content: '';
  flex: 0 0 43px;
  height: 43px;
}
.chat-stickers--available {
  position: relative;
  --chat-picker-height: 382px;
}
.emoji-picker.chat-stickers--available .v3-emoji-picker {
  height: min(
    var(--emoji-picker-height, var(--chat-picker-height)),
    var(--chat-picker-height),
    calc(100dvh - 16px)
  );
}
.chat-sticker-picker__mode {
  display: flex;
  order: 1;
  flex: 0 0 43px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: 100%;
  height: 43px;
  padding-top: 10px;
  border-top: 0.5px solid var(--border-table, #e7e7e7);
  box-sizing: border-box;
}
.chat-sticker-picker__mode-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--border-table, #e7e7e7);
  border-radius: 100px;
  background: transparent;
  color: var(--text-primary, #181818);
  box-sizing: border-box;
  font: inherit;
  font-size: 14px;
  line-height: 17px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}
.chat-sticker-picker__mode-button[aria-pressed='true'] {
  border-color: var(--action-primary-bg, #77a6ff);
  color: var(--action-primary-bg, #77a6ff);
}
.chat-sticker-picker__mode-button:hover {
  background: var(--action-secondary-hover-bg, #f2f7ff);
}
.chat-sticker-picker__mode-button:focus-visible {
  outline: 2px solid var(--border-hover, #9cbeff);
  outline-offset: -2px;
}
.chat-stickers--active .v3-header > .v3-groups {
  visibility: hidden;
}
.chat-stickers--active .v3-body-inner {
  display: none !important;
}
.chat-sticker-picker {
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  color: var(--text-primary, #1c2535);
}
.chat-sticker-picker--preparing {
  position: fixed;
  top: 0;
  left: -10000px;
  width: 320px;
  height: 300px;
  visibility: hidden;
  pointer-events: none;
}
.chat-sticker-picker__packs {
  display: flex;
  gap: 8px;
  align-items: center;
  position: absolute;
  top: 60px;
  left: 15px;
  width: calc(100% - 30px);
  z-index: 1;
  height: 30px;
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
  position: relative;
  display: grid;
  align-items: center;
  justify-items: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 5px;
  padding: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.chat-sticker-picker__pack-preview {
  width: 30px;
  height: 30px;
  object-fit: contain;
  pointer-events: none;
}
.chat-sticker-picker__recent {
  opacity: 0.55;
}
.chat-sticker-picker__recent img {
  width: 30px;
  height: 30px;
  content: var(--emoji-recent-icon);
  pointer-events: none;
}
:is([data-theme='dark'], .theme-dark) .chat-sticker-picker__recent {
  opacity: 0.45;
}
:is([data-theme='dark'], .theme-dark) .chat-sticker-picker__recent img {
  filter: brightness(0) invert(1);
}
.chat-sticker-picker__packs button[aria-pressed='true']::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 2px;
  border-radius: 2px;
  background: var(--action-primary-bg, #77a6ff);
  content: '';
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
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.chat-sticker-picker__item img {
  width: 100%;
  height: 100%;
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

@media screen and (width <= 768px) {
  .chat-sticker-picker,
  .chat-sticker-picker__packs {
    scrollbar-width: none;
  }

  .chat-sticker-picker::-webkit-scrollbar,
  .chat-sticker-picker__packs::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
}
</style>
