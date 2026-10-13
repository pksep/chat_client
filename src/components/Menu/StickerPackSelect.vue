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
      :id="optionsId"
      class="menu-profile__sticker-options"
      role="group"
      aria-label="Отображение наборов стикеров"
      :aria-busy="loading || saving"
    >
      <p
        v-if="loading && !packs.length"
        class="menu-profile__sticker-state"
        role="status"
      >
        Загрузка наборов…
      </p>
      <div
        v-for="pack in packs"
        :key="pack.id"
        class="menu-profile__sticker-option"
        @click="togglePack(pack.id, hidden.includes(pack.id))"
      >
        <img
          :src="buildStickerAssetUrl(previewPaths[pack.id] || pack.previewPath)"
          alt=""
          width="24"
          height="24"
          decoding="async"
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
  saveHiddenStickerPacks
} from '../../services/sticker-preferences';
import { buildStickerAssetUrl } from '../../utils/sticker-assets';

withDefaults(defineProps<{ dataTestid?: string }>(), {
  dataTestid: 'StickerPackSelect'
});
const optionsId = useId();
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const packs = ref<StickerPack[]>([]);
const previewPaths = ref<Record<string, string>>({});
const loading = ref(false);
const saving = ref(false);
const loadError = ref('');
const saveError = ref('');
const pendingHidden = ref<string[] | null>(null);
const hidden = computed(() => pendingHidden.value ?? hiddenStickerPacks.value);
let abort: AbortController | undefined;

const close = () => {
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
  close();
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
const togglePack = async (id: string, enabled: boolean) => {
  saveError.value = '';
  pendingHidden.value = enabled
    ? hidden.value.filter(pack => pack !== id)
    : [...hidden.value, id];
  if (saving.value) return;
  saving.value = true;
  try {
    // Быстрые переключения сохраняем последовательно, не блокируя остальные строки.
    while (pendingHidden.value) {
      const selection = pendingHidden.value;
      await saveHiddenStickerPacks(selection);
      if (pendingHidden.value === selection) pendingHidden.value = null;
    }
  } catch {
    saveError.value = 'Не удалось сохранить выбор стикеров. Попробуйте ещё раз';
  } finally {
    pendingHidden.value = null;
    saving.value = false;
  }
};
onBeforeUnmount(() => abort?.abort());
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
