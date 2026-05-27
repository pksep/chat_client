<template>
  <section
    class="menu-profile"
    :data-testid="`${props.dataTestid}-MenuProfilePanel-Container`"
  >
    <h4
      class="menu-profile__title"
      :data-testid="`${props.dataTestid}-MenuProfilePanel-Title`"
    >
      Профиль
    </h4>
    <div v-if="authUser" class="menu-profile__body">
      <header class="menu-profile__header">
        <CachedAvatar
          class="menu-profile__avatar"
          :path="authUser.avatarUrl"
          :initials="authUser.initials || authUser.nickname"
          :data-testid="`${props.dataTestid}-MenuProfilePanel-Avatar`"
        />
      </header>

      <div class="menu-profile__form">
        <div class="menu-profile__row">
          <span
            class="menu-profile__row-value"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-ProfileValue`"
          >
            {{ authUser.initials || authUser.nickname }}
          </span>
        </div>

        <div class="menu-profile__status">
          <div
            v-if="!currentStatusLabel"
            class="menu-profile__status-trigger"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-StatusTrigger`"
            @click="toggleStatusMenu"
          >
            <span>Установить статус</span>
            <Icon
              :name="
                isStatusMenuOpen
                  ? IconNameEnum.chevronUp
                  : IconNameEnum.chevronDown
              "
              :width="24"
              :height="20"
            />
          </div>

          <div
            v-if="currentStatusLabel"
            class="menu-profile__status-current"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-CurrentStatus`"
          >
            <span>{{ currentStatusLabel }}</span>
            <Button
              :type="ButtonTypeEnum.ghost"
              class="menu-profile__status-clear"
              :size="SizesEnum.little"
              :disabled="isSavingStatus"
              @click="clearStatus"
            >
              <Icon :name="IconNameEnum.closeTag" :width="16" :height="16" />
            </Button>
          </div>

          <div
            v-if="isStatusMenuOpen"
            class="menu-profile__status-menu"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-StatusMenu`"
          >
            <button
              v-for="option in statusPresets"
              :key="`${option.icon}-${option.text}`"
              type="button"
              class="menu-profile__status-option"
              :disabled="isSavingStatus"
              @click="selectPreset(option)"
            >
              <span class="menu-profile__status-option-icon">
                {{ option.icon }}
              </span>
              <span>{{ option.text }}</span>
            </button>

            <button
              type="button"
              class="menu-profile__status-option"
              :disabled="isSavingStatus"
              @click="openCustomStatus"
            >
              <span class="menu-profile__status-option-icon">🦄</span>
              <span>Свой вариант</span>
            </button>

            <div
              v-if="isCustomStatusOpen"
              class="menu-profile__status-custom"
              :data-testid="`${props.dataTestid}-MenuProfilePanel-CustomStatus`"
            >
              <div class="menu-profile__status-custom__input__group">
                <button
                  type="button"
                  class="menu-profile__status-emoji-button"
                  :disabled="isSavingStatus"
                  @click="toggleEmojiPicker"
                >
                  <Icon
                    v-if="!customStatusIcon"
                    :name="IconNameEnum.smile"
                    :width="20"
                    :height="20"
                  />
                  <span v-else class="menu-profile__status-emoji">
                    {{ customStatusIcon }}
                  </span>
                </button>
                <input
                  v-model="customStatusText"
                  class="menu-profile__status-input"
                  type="text"
                  maxlength="40"
                  placeholder="Выберите эмодзи и введите текст"
                />
              </div>
              <div
                v-if="isEmojiPickerOpen"
                class="menu-profile__status-emoji-picker"
              >
                <EmojiPicker @select="handleSelectEmoji" />
              </div>
              <Button
                :type="ButtonTypeEnum.primary"
                :size="SizesEnum.small"
                class="menu-profile__status-save"
                :disabled="isSavingStatus || !canSaveCustomStatus"
                @click="saveCustomStatus"
              >
                {{ isSavingStatus ? 'Сохраняем...' : 'Сохранить' }}
              </Button>
            </div>
          </div>

          <p v-if="statusError" class="menu-profile__status-error">
            {{ statusError }}
          </p>
        </div>

        <div class="menu-profile__wallpapers">
          <div
            class="menu-profile__wallpapers-trigger"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-WallpaperTrigger`"
            @click="toggleWallpaperMenu"
          >
            <div class="menu-profile__wallpapers-trigger-copy">
              <span class="menu-profile__wallpapers-trigger-title">
                Обои для чатов
              </span>
            </div>
            <Icon
              :name="
                isWallpaperMenuOpen
                  ? IconNameEnum.chevronUp
                  : IconNameEnum.chevronDown
              "
              :width="24"
              :height="20"
            />
          </div>

          <div
            v-if="isWallpaperMenuOpen"
            class="menu-profile__wallpapers-menu"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-WallpaperMenu`"
          >
            <div class="menu-profile__wallpapers-grid">
              <button
                v-for="wallpaper in wallpaperPreviewItems"
                :key="wallpaper.id"
                type="button"
                :class="[
                  'menu-profile__wallpaper-tile',
                  {
                    'menu-profile__wallpaper-tile--active':
                      selectedWallpaperId === wallpaper.id
                  }
                ]"
                @click="selectWallpaperOption(wallpaper.id)"
              >
                <span
                  class="menu-profile__wallpaper-tile-preview"
                  :style="wallpaper.previewStyle"
                />
                <Checkbox
                  v-if="selectedWallpaperId === wallpaper.id"
                  class="menu-profile__wallpaper-tile-check"
                  :model-value="true"
                  :circular="CheckboxCircularEnum.circled"
                  @click.stop
                />
              </button>
            </div>

            <input
              v-show="false"
              ref="wallpaperInputRef"
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
              @change="handleWallpaperUpload"
            />

            <div class="menu-profile__wallpapers-actions">
              <Button
                :type="ButtonTypeEnum.secondary"
                :size="SizesEnum.small"
                class="menu-profile__wallpapers-button"
                @click="openWallpaperPicker"
              >
                Загрузить изображение
              </Button>
            </div>

            <p v-if="wallpaperError" class="menu-profile__wallpapers-error">
              {{ wallpaperError }}
            </p>
          </div>
        </div>

        <div class="menu-profile__wallpapers">
          <div
            class="menu-profile__wallpapers-trigger"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-CallBackgroundTrigger`"
            @click="toggleCallBackgroundMenu"
          >
            <div class="menu-profile__wallpapers-trigger-copy">
              <span class="menu-profile__wallpapers-trigger-title">
                Фон для звонков
              </span>
            </div>
            <Icon
              :name="
                isCallBackgroundMenuOpen
                  ? IconNameEnum.chevronUp
                  : IconNameEnum.chevronDown
              "
              :width="24"
              :height="20"
            />
          </div>

          <div
            v-if="isCallBackgroundMenuOpen"
            class="menu-profile__wallpapers-menu"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-CallBackgroundMenu`"
          >
            <div class="menu-profile__wallpapers-grid">
              <button
                v-for="background in callBackgroundPreviewItems"
                :key="background.id"
                type="button"
                :class="[
                  'menu-profile__wallpaper-tile',
                  {
                    'menu-profile__wallpaper-tile--active':
                      selectedCallBackgroundId === background.id
                  }
                ]"
                @click="selectCallBackgroundOption(background.id)"
              >
                <span
                  class="menu-profile__wallpaper-tile-preview"
                  :style="background.previewStyle"
                />
                <span
                  v-if="background.label"
                  class="menu-profile__call-background-tile-label"
                >
                  {{ background.label }}
                </span>
                <Checkbox
                  v-if="selectedCallBackgroundId === background.id"
                  class="menu-profile__wallpaper-tile-check"
                  :model-value="true"
                  :circular="CheckboxCircularEnum.circled"
                  @click.stop
                />
              </button>
            </div>

            <input
              v-show="false"
              ref="callBackgroundInputRef"
              type="file"
              accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp"
              @change="handleCallBackgroundUpload"
            />

            <div class="menu-profile__wallpapers-actions">
              <Button
                :type="ButtonTypeEnum.secondary"
                :size="SizesEnum.small"
                class="menu-profile__wallpapers-button"
                @click="openCallBackgroundPicker"
              >
                Загрузить изображение
              </Button>
            </div>

            <p
              v-if="callBackgroundError"
              class="menu-profile__wallpapers-error"
            >
              {{ callBackgroundError }}
            </p>
          </div>
        </div>

        <div class="menu-profile__actions">
          <Button
            :type="ButtonTypeEnum.ghost"
            class="menu-profile__logout"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-LogoutButton`"
            @click="handleLogout"
            :size="SizesEnum.small"
          >
            <template #left-icon>
              <Icon
                :name="IconNameEnum.logout"
                :width="24"
                :height="24"
                class="menu-profile__logout__icon"
              />
            </template>
            Выйти
          </Button>
        </div>
      </div>
    </div>

    <div v-else class="menu-panel menu-panel--centered">
      <p class="menu-panel__description">Профиль загружается...</p>
    </div>
  </section>

  <MobileModal
    v-if="isMobile"
    class="menu-profile__wallpaper-preview-mobile"
    headerClass="hidden"
    :show-divider="false"
    :open="isWallpaperPreviewOpen"
    @unmount-close="closeWallpaperPreview"
  >
    <div class="menu-profile__wallpaper-preview-modal">
      <div
        class="menu-profile__wallpaper-preview-surface"
        :style="pendingWallpaperPreviewStyle"
      >
        <div class="menu-profile__wallpaper-preview-chat">
          <MessageBubble
            class="message__bubble system-message-text"
            :message="wallpaperPreviewIncomingMessage"
            time="12:10"
            data-testid="WallpaperPreview-Incoming"
          />
          <MessageBubble
            class="message__bubble message__other"
            :message="wallpaperPreviewOutgoingMessage"
            time="12:10"
            :is-me-sender="true"
            :is-read="true"
            data-testid="WallpaperPreview-Outgoing"
          />
        </div>
      </div>

      <div class="menu-profile__wallpaper-preview-actions">
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.small"
          class="menu-profile__wallpaper-preview-cancel"
          @click="closeWallpaperPreview"
        >
          Отменить
        </Button>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          class="menu-profile__wallpaper-preview-apply"
          :disabled="
            isApplyingWallpaper ||
            (!pendingWallpaperDataUrl && !pendingWallpaperSelectionId)
          "
          @click="applyPendingWallpaper"
        >
          {{ isApplyingWallpaper ? 'Сохраняем...' : 'Применить' }}
        </Button>
      </div>
    </div>
  </MobileModal>

  <Modal
    v-else
    :open="isWallpaperPreviewOpen"
    class="menu-profile__wallpaper-modal"
    position="center"
    width="640px"
    @close="closeWallpaperPreview"
  >
    <div class="menu-profile__wallpaper-preview-modal">
      <div class="menu-profile__wallpaper-preview-header">
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.little"
          class="menu-profile__wallpaper-preview-close"
          @click="closeWallpaperPreview"
        >
          <Icon :name="IconNameEnum.crossSmall" :width="24" :height="24" />
        </Button>
      </div>

      <div
        class="menu-profile__wallpaper-preview-surface"
        :style="pendingWallpaperPreviewStyle"
      >
        <div class="menu-profile__wallpaper-preview-chat">
          <MessageBubble
            class="message__bubble"
            :message="wallpaperPreviewIncomingMessage"
            time="12:10"
            data-testid="WallpaperPreview-Incoming"
          />
          <MessageBubble
            class="message__bubble message__other"
            :message="wallpaperPreviewOutgoingMessage"
            time="12:10"
            :is-me-sender="true"
            :is-read="true"
            data-testid="WallpaperPreview-Outgoing"
          />
        </div>
      </div>

      <div class="menu-profile__wallpaper-preview-actions">
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          class="menu-profile__wallpaper-preview-apply"
          :disabled="
            isApplyingWallpaper ||
            (!pendingWallpaperDataUrl && !pendingWallpaperSelectionId)
          "
          @click="applyPendingWallpaper"
        >
          {{ isApplyingWallpaper ? 'Сохраняем...' : 'Применить' }}
        </Button>
      </div>
    </div>
  </Modal>

  <MobileModal
    v-if="false && isMobile"
    class="menu-profile__wallpaper-preview-mobile menu-profile__call-background-preview-mobile"
    headerClass="hidden"
    :show-divider="false"
    :open="isCallBackgroundPreviewOpen"
    @unmount-close="closeCallBackgroundPreview"
  >
    <div class="menu-profile__call-background-preview-modal">
      <div class="menu-profile__call-background-preview-frame">
        <div
          class="menu-profile__call-background-preview-surface"
          :style="pendingCallBackgroundPreviewStyle"
        >
          <img
            class="menu-profile__call-background-preview-person"
            :src="callBackgroundPreviewHumanSrc"
            alt=""
          />
        </div>
      </div>

      <div class="menu-profile__call-background-preview-actions">
        <Button
          :type="ButtonTypeEnum.secondary"
          :size="SizesEnum.small"
          class="menu-profile__call-background-preview-cancel"
          @click="closeCallBackgroundPreview"
        >
          Отменить
        </Button>
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          class="menu-profile__call-background-preview-apply"
          :disabled="
            isApplyingCallBackground ||
            (!pendingCallBackgroundDataUrl && !pendingCallBackgroundSelectionId)
          "
          @click="applyPendingCallBackground"
        >
          {{ isApplyingCallBackground ? 'Сохраняем...' : 'Применить' }}
        </Button>
      </div>
    </div>
  </MobileModal>

  <Modal
    v-else-if="false"
    :open="isCallBackgroundPreviewOpen"
    class="menu-profile__wallpaper-modal"
    position="center"
    width="420px"
    @close="closeCallBackgroundPreview"
  >
    <div class="menu-profile__wallpaper-preview-modal">
      <div class="menu-profile__wallpaper-preview-header">
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.little"
          class="menu-profile__wallpaper-preview-close"
          @click="closeCallBackgroundPreview"
        >
          <Icon :name="IconNameEnum.crossSmall" :width="24" :height="24" />
        </Button>
      </div>

      <div class="menu-profile__call-background-preview-frame">
        <div
          class="menu-profile__call-background-preview-surface"
          :style="pendingCallBackgroundPreviewStyle"
        >
          <img
            class="menu-profile__call-background-preview-person"
            :src="callBackgroundPreviewHumanSrc"
            alt=""
          />
        </div>
      </div>

      <div class="menu-profile__wallpaper-preview-actions">
        <Button
          :type="ButtonTypeEnum.primary"
          :size="SizesEnum.small"
          class="menu-profile__wallpaper-preview-apply"
          :disabled="
            isApplyingCallBackground ||
            (!pendingCallBackgroundDataUrl && !pendingCallBackgroundSelectionId)
          "
          @click="applyPendingCallBackground"
        >
          {{ isApplyingCallBackground ? 'Сохраняем...' : 'Применить' }}
        </Button>
      </div>
    </div>
  </Modal>

  <CallBackgroundPreviewModal
    :open="isCallBackgroundPreviewOpen"
    :is-mobile="isMobile"
    :is-applying="isApplyingCallBackground"
    :disabled="
      !pendingCallBackgroundDataUrl && !pendingCallBackgroundSelectionId
    "
    :pending-selection-id="pendingCallBackgroundSelectionId"
    :pending-data-url="pendingCallBackgroundDataUrl"
    @close="closeCallBackgroundPreview"
    @apply="applyPendingCallBackground"
  />
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxCircularEnum,
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum
} from '@pksep/yui';
import { computed, ref, useTemplateRef, type CSSProperties } from 'vue';
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';
import type { IUser, IUserStatus } from '../interfaces/interfaces';
import CachedAvatar from '../UI/CachedAvatar.vue';
import {
  getAuthUser,
  redirectToAuthorization
} from '../../composables/useAuth';
import { useLogout } from '../../composables/useLogin';
import { cleanupPushNotificationsOnLogout } from '../../services/usePushNotifications';
import { updateCurrentUserStatus } from '../../services/useUserStatus';
import {
  formatUserStatusLabel,
  normalizeUserStatus,
  USER_STATUS_PRESETS
} from '../../utils/userStatus';
import { useChatWallpaper } from '../../composables/useChatWallpaper';
import { useCallBackground } from '../../composables/useCallBackground';
import { fileToDataURL } from '../../utils/fileToDataURL';
import MobileModal from '../UI/MobileModal.vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import MessageBubble from '../Messages/MessageBubble.vue';
import CallBackgroundPreviewModal from '../CallModal/CallBackgroundPreviewModal.vue';

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
  }>(),
  {
    dataTestid: 'MenuProfilePanel'
  }
);

const authUser = computed(() => getAuthUser() as IUser | null);
const { state: isMobile } = useResizeState(MAX_W_MD);
const statusPresets = USER_STATUS_PRESETS;
const MAX_CUSTOM_WALLPAPER_SIZE_BYTES = 2 * 1024 * 1024;
const isStatusMenuOpen = ref(false);
const isCustomStatusOpen = ref(false);
const isEmojiPickerOpen = ref(false);
const isWallpaperMenuOpen = ref(false);
const isWallpaperPreviewOpen = ref(false);
const isApplyingWallpaper = ref(false);
const isCallBackgroundMenuOpen = ref(false);
const isCallBackgroundPreviewOpen = ref(false);
const isApplyingCallBackground = ref(false);
const isSavingStatus = ref(false);
const statusError = ref('');
const wallpaperError = ref('');
const callBackgroundError = ref('');
const customStatusIcon = ref('');
const customStatusText = ref('');
const pendingWallpaperDataUrl = ref('');
const pendingWallpaperSelectionId = ref('');
const pendingCallBackgroundDataUrl = ref('');
const pendingCallBackgroundSelectionId = ref('');
const wallpaperInputRef = useTemplateRef<HTMLInputElement>('wallpaperInputRef');
const callBackgroundInputRef = useTemplateRef<HTMLInputElement>(
  'callBackgroundInputRef'
);
const {
  wallpaperPreviewItems,
  selectedWallpaperId,
  selectWallpaper,
  setCustomWallpaper
} = useChatWallpaper();
const {
  callBackgroundPreviewItems,
  selectedCallBackgroundId,
  selectCallBackground,
  setCustomCallBackground
} = useCallBackground();

const currentStatusLabel = computed(() =>
  formatUserStatusLabel(authUser.value?.status)
);

const canSaveCustomStatus = computed(
  () =>
    !!normalizeUserStatus({
      icon: customStatusIcon.value,
      text: customStatusText.value
    })
);
const wallpaperPreviewIncomingMessage =
  '\u0427\u0442\u043e\u0431\u044b \u0443\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u043e\u0431\u043e\u0438, \u043d\u0430\u0436\u043c\u0438\u0442\u0435 "\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c"';
const wallpaperPreviewOutgoingMessage =
  '\u0421\u043f\u0430\u0441\u0438\u0431\u043e!';
const callBackgroundPreviewHumanSrc = '/images/human.webp';

const resolvePendingPreviewStyle = (
  previewItems: Array<{ id: string; previewStyle: CSSProperties }>,
  pendingSelectionId: string,
  pendingDataUrl: string
): CSSProperties => {
  if (pendingDataUrl) {
    return {
      backgroundColor: '#f4f8ff',
      backgroundImage: `url("${pendingDataUrl}")`,
      backgroundPosition: 'center center',
      backgroundRepeat: 'repeat',
      backgroundSize: 'cover'
    };
  }

  const selectedPreviewItem = previewItems.find(
    item => item.id === pendingSelectionId
  );

  return (
    selectedPreviewItem?.previewStyle || {
      background:
        'linear-gradient(180deg, rgba(251, 253, 255, 1) 0%, rgba(236, 243, 255, 1) 100%)'
    }
  );
};

const resolveCustomWallpaperUploadError = (file: File): string => {
  const isSupportedFile =
    file.type.startsWith('image/') || file.name.toLowerCase().endsWith('.svg');

  if (!isSupportedFile) {
    return 'Поддерживаются SVG, PNG, JPG и WebP';
  }

  if (file.size > MAX_CUSTOM_WALLPAPER_SIZE_BYTES) {
    return 'Файл слишком большой. Выберите изображение до 2 МБ';
  }

  return '';
};

const pendingWallpaperPreviewStyle = computed<CSSProperties>(() => {
  return resolvePendingPreviewStyle(
    wallpaperPreviewItems.value,
    pendingWallpaperSelectionId.value,
    pendingWallpaperDataUrl.value
  );
});

const pendingCallBackgroundPreviewStyle = computed<CSSProperties>(() => {
  return resolvePendingPreviewStyle(
    callBackgroundPreviewItems.value,
    pendingCallBackgroundSelectionId.value,
    pendingCallBackgroundDataUrl.value
  );
});

const resetCustomStatusForm = (): void => {
  customStatusIcon.value = '';
  customStatusText.value = '';
  isCustomStatusOpen.value = false;
  isEmojiPickerOpen.value = false;
};

const toggleStatusMenu = (): void => {
  isStatusMenuOpen.value = !isStatusMenuOpen.value;

  if (!isStatusMenuOpen.value) {
    resetCustomStatusForm();
  }
};

const openCustomStatus = (): void => {
  isCustomStatusOpen.value = true;
  isEmojiPickerOpen.value = false;
};

const toggleEmojiPicker = (): void => {
  isEmojiPickerOpen.value = !isEmojiPickerOpen.value;
};

const toggleWallpaperMenu = (): void => {
  isWallpaperMenuOpen.value = !isWallpaperMenuOpen.value;
};

const toggleCallBackgroundMenu = (): void => {
  isCallBackgroundMenuOpen.value = !isCallBackgroundMenuOpen.value;
};

const openWallpaperPreviewForSelection = (wallpaperId: string): void => {
  pendingWallpaperSelectionId.value = wallpaperId;
  pendingWallpaperDataUrl.value = '';
  isWallpaperPreviewOpen.value = true;
};

const selectWallpaperOption = (wallpaperId: string): void => {
  wallpaperError.value = '';

  if (isMobile.value) {
    openWallpaperPreviewForSelection(wallpaperId);
    return;
  }

  selectWallpaper(wallpaperId);
};

const openWallpaperPicker = (): void => {
  wallpaperError.value = '';
  wallpaperInputRef.value?.click();
};

const openCallBackgroundPreviewForSelection = (backgroundId: string): void => {
  pendingCallBackgroundSelectionId.value = backgroundId;
  pendingCallBackgroundDataUrl.value = '';
  isCallBackgroundPreviewOpen.value = true;
};

const selectCallBackgroundOption = (backgroundId: string): void => {
  callBackgroundError.value = '';
  openCallBackgroundPreviewForSelection(backgroundId);
};

const openCallBackgroundPicker = (): void => {
  callBackgroundError.value = '';
  callBackgroundInputRef.value?.click();
};

const closeWallpaperPreview = (): void => {
  isWallpaperPreviewOpen.value = false;
  isApplyingWallpaper.value = false;
  pendingWallpaperDataUrl.value = '';
  pendingWallpaperSelectionId.value = '';
};

const closeCallBackgroundPreview = (): void => {
  isCallBackgroundPreviewOpen.value = false;
  isApplyingCallBackground.value = false;
  pendingCallBackgroundDataUrl.value = '';
  pendingCallBackgroundSelectionId.value = '';
};

const handleWallpaperUpload = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];

  if (!file) {
    return;
  }

  wallpaperError.value = '';
  const validationError = resolveCustomWallpaperUploadError(file);
  const isSupportedFile = !validationError;

  if (!isSupportedFile) {
    wallpaperError.value = 'Поддерживаются SVG, PNG, JPG и WebP';
    input.value = '';
    return;
  }

  if (file.size > MAX_CUSTOM_WALLPAPER_SIZE_BYTES) {
    wallpaperError.value = 'Файл слишком большой. Выберите изображение до 2 МБ';
    input.value = '';
    return;
  }

  try {
    const dataUrl = await fileToDataURL(file);
    pendingWallpaperDataUrl.value = dataUrl;
    pendingWallpaperSelectionId.value = '';
    isWallpaperPreviewOpen.value = true;
  } catch (error) {
    console.error('Failed to save custom wallpaper:', error);
    wallpaperError.value =
      'Не получилось сохранить изображение. Попробуйте SVG или файл поменьше';
  } finally {
    isApplyingWallpaper.value = false;
    input.value = '';
  }
};

const applyPendingWallpaper = async (): Promise<void> => {
  if (!pendingWallpaperDataUrl.value && !pendingWallpaperSelectionId.value) {
    return;
  }

  wallpaperError.value = '';
  isApplyingWallpaper.value = true;

  try {
    if (pendingWallpaperDataUrl.value) {
      await setCustomWallpaper(pendingWallpaperDataUrl.value);
    } else {
      selectWallpaper(pendingWallpaperSelectionId.value);
    }

    closeWallpaperPreview();
  } catch (error) {
    console.error('Failed to persist custom wallpaper:', error);
    wallpaperError.value =
      'Не получилось сохранить изображение. Попробуйте SVG или файл поменьше';
    isApplyingWallpaper.value = false;
  }
};

const handleCallBackgroundUpload = async (event: Event): Promise<void> => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];

  if (!file) {
    return;
  }

  callBackgroundError.value = '';
  const validationError = resolveCustomWallpaperUploadError(file);

  if (validationError) {
    callBackgroundError.value = validationError;
    input.value = '';
    return;
  }

  try {
    const dataUrl = await fileToDataURL(file);
    pendingCallBackgroundDataUrl.value = dataUrl;
    pendingCallBackgroundSelectionId.value = '';
    isCallBackgroundPreviewOpen.value = true;
  } catch (error) {
    console.error('Failed to save custom call background:', error);
    callBackgroundError.value =
      'Не получилось сохранить изображение. Попробуйте SVG или файл поменьше';
  } finally {
    isApplyingCallBackground.value = false;
    input.value = '';
  }
};

const applyPendingCallBackground = async (): Promise<void> => {
  if (
    !pendingCallBackgroundDataUrl.value &&
    !pendingCallBackgroundSelectionId.value
  ) {
    return;
  }

  callBackgroundError.value = '';
  isApplyingCallBackground.value = true;

  try {
    if (pendingCallBackgroundDataUrl.value) {
      await setCustomCallBackground(pendingCallBackgroundDataUrl.value);
    } else {
      selectCallBackground(pendingCallBackgroundSelectionId.value);
    }

    closeCallBackgroundPreview();
  } catch (error) {
    console.error('Failed to persist custom call background:', error);
    callBackgroundError.value =
      'Не получилось сохранить изображение. Попробуйте SVG или файл поменьше';
    isApplyingCallBackground.value = false;
  }
};

const handleSelectEmoji = (emoji: { i: string }): void => {
  customStatusIcon.value = emoji.i;
  isEmojiPickerOpen.value = false;
};

const saveStatus = async (status: IUserStatus | null): Promise<void> => {
  statusError.value = '';
  isSavingStatus.value = true;

  try {
    await updateCurrentUserStatus(status);
    isStatusMenuOpen.value = false;
    resetCustomStatusForm();
  } catch (error) {
    console.error('Failed to update user status:', error);
    statusError.value = 'Не получилось обновить статус';
  } finally {
    isSavingStatus.value = false;
  }
};

const selectPreset = async (status: IUserStatus): Promise<void> => {
  await saveStatus(status);
};

const saveCustomStatus = async (): Promise<void> => {
  const customStatus = normalizeUserStatus({
    icon: customStatusIcon.value,
    text: customStatusText.value
  });

  if (!customStatus) {
    return;
  }

  await saveStatus(customStatus);
};

const clearStatus = async (): Promise<void> => {
  await saveStatus(null);
};

const waitWithTimeout = async (
  promise: Promise<void>,
  timeoutMs: number
): Promise<void> => {
  await Promise.race([
    promise,
    new Promise<void>(resolve => {
      window.setTimeout(resolve, timeoutMs);
    })
  ]);
};

const handleLogout = async (): Promise<void> => {
  try {
    await waitWithTimeout(cleanupPushNotificationsOnLogout(), 2500);
  } catch (error) {
    console.warn('Failed to cleanup push notifications during logout:', error);
  } finally {
    useLogout();
    redirectToAuthorization();
  }
};
</script>
