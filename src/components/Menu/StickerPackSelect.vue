<template>
  <div
    class="menu-profile__stickers"
    :class="{ 'menu-profile__stickers--open': open }"
  >
    <button
      ref="trigger"
      type="button"
      class="menu-profile__wallpapers-trigger"
      :aria-expanded="open"
      :aria-controls="optionsId"
      :data-testid="`${dataTestid}-Trigger`"
      @click="open = !open"
    >
      <span class="menu-profile__wallpapers-trigger-title"
        >Отображение стикеров</span
      >
      <Icon
        :name="open ? IconNameEnum.chevronUp : IconNameEnum.chevronDown"
        :width="24"
        :height="16"
      />
    </button>
    <div
      v-show="open"
      ref="options"
      :id="optionsId"
      class="menu-profile__sticker-options"
      role="group"
      aria-label="Отображение наборов стикеров"
      :aria-busy="loading || saving"
      @click.capture="suppressDragClick"
    >
      <p
        v-if="loading && !packs.length"
        class="menu-profile__sticker-state"
        role="status"
      >
        Загрузка наборов…
      </p>
      <div
        v-for="pack in orderedPacks"
        :key="pack.id"
        class="menu-profile__sticker-option"
        :class="{
          'menu-profile__sticker-option--dragging': dragPack?.id === pack.id
        }"
        :data-pack-id="pack.id"
        tabindex="0"
        title="Перетащите для изменения порядка"
        @pointerdown="startDrag($event, pack.id)"
        @click="togglePack(pack.id, hidden.includes(pack.id))"
        @contextmenu.prevent
        @keydown.alt.up.prevent.stop="movePack(pack.id, -1)"
        @keydown.alt.down.prevent.stop="movePack(pack.id, 1)"
      >
        <img
          :src="buildStickerAssetUrl(previewPaths[pack.id] || pack.previewPath)"
          alt=""
          width="24"
          height="24"
          decoding="async"
          draggable="false"
          @error="useFallbackPreview(pack)"
        />
        <span class="menu-profile__sticker-label">{{ pack.label }}</span>
        <Checkbox
          class="menu-profile__sticker-checkbox"
          :size="CheckboxSizeEnum.small"
          :model-value="!hidden.includes(pack.id)"
          :aria-label="pack.label"
          :data-testid="`${dataTestid}-Pack-${pack.id}`"
          @click.stop
          @change="togglePack(pack.id, $event)"
        />
      </div>
      <p
        v-if="!loading && !packs.length && !loadError"
        class="menu-profile__sticker-state"
      >
        Пока нет наборов стикеров
      </p>
      <p v-if="loadError" class="menu-profile__sticker-state" role="alert">
        {{ loadError }}
        <button type="button" @click="loadPacks">Повторить</button>
      </p>
    </div>
    <p v-if="saveError" class="menu-profile__sticker-error" role="alert">
      {{ saveError }}
    </p>
    <Teleport to="body">
      <div
        v-if="dragPack"
        class="menu-profile__sticker-drag-preview"
        :style="dragStyle"
        aria-hidden="true"
      >
        <img
          :src="
            buildStickerAssetUrl(
              previewPaths[dragPack.id] || dragPack.previewPath
            )
          "
          alt=""
        />
        <span>{{ dragPack.label }}</span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { onKeyStroke } from '@vueuse/core';
import { Checkbox, CheckboxSizeEnum, Icon, IconNameEnum } from '@pksep/yui';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';
import {
  loadStickerPacks,
  type StickerPack
} from '../../services/sticker-catalog';
import {
  hiddenStickerPacks,
  stickerPackOrder,
  orderStickerPacks,
  saveStickerPreferences
} from '../../services/sticker-preferences';
import { buildStickerAssetUrl } from '../../utils/sticker-assets';

withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'StickerPackSelect'
});
const optionsId = useId();
const trigger = ref<HTMLButtonElement | null>(null);
const options = ref<HTMLElement | null>(null);
const open = ref(false);
const packs = ref<StickerPack[]>([]);
const previewPaths = ref<Record<string, string>>({});
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const saveError = ref('');
const pendingHidden = ref<string[] | null>(null);
const pendingOrder = ref<string[] | null>(null);
const dragOrder = ref<string[] | null>(null);
const hidden = computed(() => pendingHidden.value ?? hiddenStickerPacks.value);
const orderedPacks = computed(() =>
  orderStickerPacks(
    packs.value,
    dragOrder.value ?? pendingOrder.value ?? stickerPackOrder.value
  )
);
const dragPack = ref<StickerPack | null>(null);
const dragStyle = ref<Record<string, string>>({});
let pointer: {
  pointerId: number;
  pointerType: string;
  packId: string;
  target: HTMLElement;
  startX: number;
  startY: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
} | null = null;
let dragFrame = 0;
let touchHoldTimer: ReturnType<typeof setTimeout> | undefined;
let dragAppearance: Record<string, string> = {};
let ignoreClick = false;
let abort: AbortController | undefined;

const close = () => {
  finishDrag(false);
  open.value = false;
  trigger.value?.focus();
};
const useFallbackPreview = (pack: StickerPack) => {
  if (pack.messagePreviewPath && pack.messagePreviewPath !== pack.previewPath)
    previewPaths.value[pack.id] = pack.messagePreviewPath;
};
useBackButtonHandler(open, close, BackButtonPriority.overlay);
onKeyStroke('Escape', event => {
  if (!open.value) return;
  event.preventDefault();
  if (pointer) finishDrag(false);
  else close();
});
const loadPacks = async () => {
  if (loading.value) return;
  const request = new AbortController();
  abort = request;
  loading.value = true;
  loadError.value = '';
  try {
    const result = await loadStickerPacks(request.signal);
    if (!request.signal.aborted) {
      packs.value = result.packs;
      previewPaths.value = {};
    }
  } catch {
    if (!request.signal.aborted)
      loadError.value = 'Не удалось загрузить наборы стикеров';
  } finally {
    if (abort === request) loading.value = false;
  }
};
watch(open, value => {
  if (value) void loadPacks();
});
onMounted(() => void loadPacks());
const saveChanges = async () => {
  if (saving.value) return;
  saving.value = true;
  try {
    // Порядок и чекбоксы сохраняем одной очередью, чтобы быстрые действия не терялись.
    while (pendingHidden.value || pendingOrder.value) {
      const selection = pendingHidden.value;
      const order = pendingOrder.value;
      await saveStickerPreferences({
        ...(selection ? { hiddenStickerPacks: selection } : {}),
        ...(order ? { stickerPackOrder: order } : {})
      });
      if (pendingHidden.value === selection) pendingHidden.value = null;
      if (pendingOrder.value === order) pendingOrder.value = null;
    }
  } catch {
    saveError.value = 'Не удалось сохранить выбор стикеров. Попробуйте ещё раз';
  } finally {
    pendingHidden.value = null;
    pendingOrder.value = null;
    saving.value = false;
  }
};
const togglePack = (id: string, enabled: boolean) => {
  saveError.value = '';
  pendingHidden.value = enabled
    ? hidden.value.filter(pack => pack !== id)
    : [...hidden.value, id];
  void saveChanges();
};
const saveOrder = (order: string[]) => {
  saveError.value = '';
  pendingOrder.value = order;
  void saveChanges();
};
const movePack = (id: string, offset: number) => {
  const order = orderedPacks.value.map(pack => pack.id);
  const index = order.indexOf(id);
  const destination = index + offset;
  if (index < 0 || destination < 0 || destination >= order.length) return;
  order.splice(index, 1);
  order.splice(destination, 0, id);
  saveOrder(order);
};
const suppressDragClick = (event: MouseEvent) => {
  if (!ignoreClick || event.detail === 0) return;
  event.preventDefault();
  event.stopPropagation();
  ignoreClick = false;
};
const positionDrag = () => {
  if (!pointer || !dragPack.value) return;
  dragStyle.value = {
    ...dragAppearance,
    width: `${pointer.width}px`,
    transform: `translate3d(${pointer.startX - pointer.offsetX}px, ${pointer.y - pointer.offsetY}px, 0)`
  };
  const list = options.value;
  if (!list) return;
  const rows = [...list.querySelectorAll<HTMLElement>('[data-pack-id]')];
  const order = orderedPacks.value.map(pack => pack.id);
  const from = order.indexOf(pointer.packId);
  const destination = rows.findIndex(row => {
    const rect = row.getBoundingClientRect();
    return pointer!.y >= rect.top && pointer!.y <= rect.bottom;
  });
  if (from < 0 || destination < 0 || from === destination) return;
  const rect = rows[destination].getBoundingClientRect();
  const middle = rect.top + rect.height / 2;
  if (
    (destination > from && pointer.y < middle) ||
    (destination < from && pointer.y > middle)
  )
    return;
  order.splice(from, 1);
  order.splice(destination, 0, pointer.packId);
  dragOrder.value = order;
};
const scrollDrag = () => {
  if (!pointer || !dragPack.value || !options.value) return;
  const list = options.value;
  const bounds = list.getBoundingClientRect();
  const top = pointer.y - bounds.top;
  const bottom = bounds.bottom - pointer.y;
  const speed =
    top < 36
      ? -Math.min(12, (36 - top) / 3)
      : bottom < 36
        ? Math.min(12, (36 - bottom) / 3)
        : 0;
  if (speed) list.scrollTop += speed;
  positionDrag();
  dragFrame = requestAnimationFrame(scrollDrag);
};
const activateDrag = () => {
  if (!pointer || !pointer.target.isConnected) return;
  dragPack.value =
    packs.value.find(pack => pack.id === pointer!.packId) || null;
  if (!dragPack.value) return;
  const style = getComputedStyle(options.value!);
  dragAppearance = {
    backgroundColor: style.backgroundColor,
    color: style.color,
    fontFamily: style.fontFamily
  };
  dragOrder.value = orderedPacks.value.map(pack => pack.id);
  pointer.target.setPointerCapture(pointer.pointerId);
  ignoreClick = true;
  positionDrag();
  dragFrame = requestAnimationFrame(scrollDrag);
};
const moveDrag = (event: PointerEvent) => {
  if (!pointer || event.pointerId !== pointer.pointerId) return;
  if (!dragPack.value && pointer.pointerType === 'touch') {
    if (
      Math.hypot(
        event.clientX - pointer.startX,
        event.clientY - pointer.startY
      ) > 5
    )
      finishDrag(false);
    return;
  }
  pointer.y = event.clientY;
  if (!dragPack.value) {
    if (Math.abs(pointer.y - pointer.startY) < 5) return;
    activateDrag();
  }
  event.preventDefault();
  positionDrag();
};
const preventDragScroll = (event: TouchEvent) => {
  if (dragPack.value) event.preventDefault();
};
const finishDrag = (save: boolean) => {
  const previous = pointer;
  pointer = null;
  clearTimeout(touchHoldTimer);
  cancelAnimationFrame(dragFrame);
  const order = dragOrder.value;
  const changed =
    order &&
    order.join(',') !==
      orderStickerPacks(
        packs.value,
        pendingOrder.value ?? stickerPackOrder.value
      )
        .map(pack => pack.id)
        .join(',');
  dragOrder.value = null;
  dragPack.value = null;
  document.removeEventListener('pointermove', moveDrag, true);
  document.removeEventListener('pointerup', endDrag, true);
  document.removeEventListener('pointercancel', cancelDrag, true);
  document.removeEventListener('touchmove', preventDragScroll, true);
  window.removeEventListener('blur', cancelDrag);
  if (previous?.target.hasPointerCapture(previous.pointerId))
    previous.target.releasePointerCapture(previous.pointerId);
  if (save && order && changed) saveOrder(order);
};
const endDrag = (event: PointerEvent) => {
  if (event.pointerId !== pointer?.pointerId) return;
  if (dragPack.value) event.preventDefault();
  finishDrag(true);
};
const cancelDrag = () => finishDrag(false);
const startDrag = (event: PointerEvent, packId: string) => {
  ignoreClick = false;
  if (
    !event.isPrimary ||
    event.button !== 0 ||
    !(event.target instanceof Element) ||
    !(event.currentTarget instanceof HTMLElement)
  )
    return;
  if (event.target.closest('.menu-profile__sticker-checkbox')) return;
  finishDrag(false);
  const bounds = event.currentTarget.getBoundingClientRect();
  pointer = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    packId,
    target: event.currentTarget,
    startX: event.clientX,
    startY: event.clientY,
    y: event.clientY,
    offsetX: event.clientX - bounds.left,
    offsetY: event.clientY - bounds.top,
    width: bounds.width
  };
  document.addEventListener('pointermove', moveDrag, true);
  document.addEventListener('pointerup', endDrag, true);
  document.addEventListener('pointercancel', cancelDrag, true);
  if (event.pointerType === 'touch') {
    touchHoldTimer = setTimeout(activateDrag, 250);
    document.addEventListener('touchmove', preventDragScroll, {
      capture: true,
      passive: false
    });
  }
  window.addEventListener('blur', cancelDrag);
};
watch(open, value => {
  if (!value) finishDrag(false);
});
onBeforeUnmount(() => {
  abort?.abort();
  finishDrag(false);
});
</script>

<style scoped>
.menu-profile__stickers {
  display: grid;
  gap: 5px;
  min-width: 0;
}
.menu-profile__stickers--open .menu-profile__wallpapers-trigger {
  border-color: var(--border-hover);
}
.menu-profile__sticker-options {
  max-height: min(264px, 40dvh);
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid var(--border-hover);
  border-radius: 5px;
  background: var(--table-surface-search);
}
.menu-profile__sticker-option {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 5px 10px;
  color: var(--text-primary);
  font-size: 14px;
  line-height: 24px;
  cursor: pointer;
}
.menu-profile__sticker-option--dragging {
  opacity: 0.3;
}
.menu-profile__sticker-option {
  user-select: none;
  -webkit-touch-callout: none;
}
.menu-profile__sticker-drag-preview {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 21000;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 5px 10px;
  box-sizing: border-box;
  border-radius: 5px;
  background: var(--table-surface-search);
  color: var(--text-primary);
  box-shadow: 0 4px 14px #0003;
  font-size: 14px;
  pointer-events: none;
}
.menu-profile__sticker-drag-preview img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.menu-profile__sticker-drag-preview span {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.menu-profile__sticker-checkbox {
  flex: 0 0 16px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}
.menu-profile__sticker-option :deep(*) {
  cursor: pointer;
}
.menu-profile__sticker-checkbox:has(:focus-visible) {
  outline: 2px solid var(--border-hover);
  outline-offset: 2px;
}
.menu-profile__sticker-checkbox :deep(.checkbox__icon) {
  pointer-events: none;
}
.menu-profile__sticker-option:hover,
.menu-profile__sticker-option:focus-within {
  background: var(--surface-hover, var(--surface-input-secondary));
}
.menu-profile__sticker-option img {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  object-fit: contain;
}
.menu-profile__sticker-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.menu-profile__sticker-state,
.menu-profile__sticker-error {
  margin: 0;
  padding: 10px;
  color: var(--text-secondary);
  font-size: 14px;
}
.menu-profile__sticker-error {
  padding: 0;
  color: var(--text-error, #e44f4f);
}
.menu-profile__sticker-state button {
  color: var(--text-link);
  cursor: pointer;
}
</style>
