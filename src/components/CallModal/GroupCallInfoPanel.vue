<template>
  <MobileModal
    v-if="isMobile"
    :open="open"
    :title="title"
    close-button-text="Назад"
    @unmount-close="$emit('close')"
    data-testid="GroupCallInfoPanel"
  >
    <template #header>
      <button class="call-modal__group-panel-back" @click="$emit('close')">
        Назад
      </button>
      <div class="call-modal__group-panel-title">
        <p>{{ title }}</p>
        <span>{{ meta }}</span>
      </div>
    </template>

    <div class="call-modal__group-panel-content">
      <div class="call-modal__group-panel-actions">
        <button class="call-modal__group-panel-copy" @click="handleCopyLink">
          <LinkIcon />
          <span>Скопировать ссылку</span>
        </button>
        <button
          v-if="props.showOpenChat && props.onOpenChat"
          class="call-modal__group-panel-copy"
          @click="handleOpenChat"
        >
          <MessageIcon />
          <span>Перейти в чат</span>
        </button>
      </div>

      <div class="call-modal__group-panel-background-select">
        <div
          class="call-modal__group-panel-background-trigger"
          @click="toggleCallBackgroundMenu"
        >
          <div class="call-modal__group-panel-background-trigger-copy">
            <span class="call-modal__group-panel-background-trigger-title">
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
          class="call-modal__group-panel-background-menu"
        >
          <div class="call-modal__group-panel-background-grid">
            <button
              v-for="background in callBackgroundPreviewItems"
              :key="background.id"
              type="button"
              :class="[
                'call-modal__group-panel-background-tile',
                {
                  'call-modal__group-panel-background-tile--active':
                    selectedCallBackgroundId === background.id
                }
              ]"
              @click="selectCallBackgroundOption(background.id)"
            >
              <span
                class="call-modal__group-panel-background-preview"
                :style="background.previewStyle"
              />
              <span
                v-if="background.label"
                class="call-modal__group-panel-background-label"
              >
                {{ background.label }}
              </span>
              <Checkbox
                v-if="selectedCallBackgroundId === background.id"
                class="call-modal__group-panel-background-check"
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

          <Button
            :type="ButtonTypeEnum.secondary"
            :size="SizesEnum.small"
            class="call-modal__group-panel-background-upload"
            @click="openCallBackgroundPicker"
          >
            Загрузить изображение
          </Button>

          <p
            v-if="callBackgroundError"
            class="call-modal__group-panel-background-error"
          >
            {{ callBackgroundError }}
          </p>
        </div>
      </div>

      <div class="call-modal__group-panel-members">
        <button
          v-for="member in members"
          :key="member.id"
          class="call-modal__group-panel-member"
          @click="handleOpenUserInfo(member)"
        >
          <CachedAvatar
            :path="member.avatarUrl"
            :initials="member.initials"
            :alt="member.initials"
            class="call-modal__group-panel-avatar"
          />

          <div class="call-modal__group-panel-member-text">
            <p>{{ member.initials }}</p>
            <span>{{ member.nickname ? `@${member.nickname}` : '' }}</span>
          </div>
        </button>
      </div>
    </div>
  </MobileModal>

  <Transition name="call-modal-group-panel">
    <div
      v-if="open && !isMobile"
      class="call-modal__group-panel-shell"
      @click="emits('close')"
    >
      <div class="call-modal__group-panel" @click.stop>
        <div class="call-modal__group-panel-header">
          <div class="call-modal__group-panel-title">
            <p>{{ title }}</p>
            <span>{{ meta }}</span>
          </div>
          <button class="call-modal__group-panel-close" @click="emits('close')">
            <Icon :name="IconNameEnum.closeTag" :width="24" :height="24" />
          </button>
        </div>

        <div class="call-modal__group-panel-content">
          <div class="call-modal__group-panel-actions">
            <button
              class="call-modal__group-panel-copy"
              @click="handleCopyLink"
            >
              <LinkIcon />
              <span>Скопировать ссылку</span>
            </button>
            <button
              v-if="props.showOpenChat && props.onOpenChat"
              class="call-modal__group-panel-copy"
              @click="handleOpenChat"
            >
              <MessageIcon />
              <span>Перейти в чат</span>
            </button>
          </div>

          <div class="call-modal__group-panel-background-select">
            <div
              class="call-modal__group-panel-background-trigger"
              @click="toggleCallBackgroundMenu"
            >
              <div class="call-modal__group-panel-background-trigger-copy">
                <span class="call-modal__group-panel-background-trigger-title">
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
              class="call-modal__group-panel-background-menu"
            >
              <div class="call-modal__group-panel-background-grid">
                <button
                  v-for="background in callBackgroundPreviewItems"
                  :key="background.id"
                  type="button"
                  :class="[
                    'call-modal__group-panel-background-tile',
                    {
                      'call-modal__group-panel-background-tile--active':
                        selectedCallBackgroundId === background.id
                    }
                  ]"
                  @click="selectCallBackgroundOption(background.id)"
                >
                  <span
                    class="call-modal__group-panel-background-preview"
                    :style="background.previewStyle"
                  />
                  <span
                    v-if="background.label"
                    class="call-modal__group-panel-background-label"
                  >
                    {{ background.label }}
                  </span>
                  <Checkbox
                    v-if="selectedCallBackgroundId === background.id"
                    class="call-modal__group-panel-background-check"
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

              <Button
                :type="ButtonTypeEnum.secondary"
                :size="SizesEnum.small"
                class="call-modal__group-panel-background-upload"
                @click="openCallBackgroundPicker"
              >
                Загрузить изображение
              </Button>

              <p
                v-if="callBackgroundError"
                class="call-modal__group-panel-background-error"
              >
                {{ callBackgroundError }}
              </p>
            </div>
          </div>

          <div class="call-modal__group-panel-members">
            <button
              v-for="member in members"
              :key="member.id"
              class="call-modal__group-panel-member"
              @click="handleOpenUserInfo(member)"
            >
              <CachedAvatar
                :path="member.avatarUrl"
                :initials="member.initials"
                :alt="member.initials"
                class="call-modal__group-panel-avatar"
              />

              <div class="call-modal__group-panel-member-text">
                <p>{{ member.initials }}</p>
                <span>{{ member.nickname ? `@${member.nickname}` : '' }}</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useDesktopCallWindowContext } from '../Desktop/call-window-context';
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxCircularEnum,
  Icon,
  IconNameEnum,
  MessageTypeEnum,
  SizesEnum
} from '@pksep/yui';
import { useCallBackground } from '../../composables/useCallBackground';
import { useUserInfoModal } from '../../composables/useUserInfoModal';
import { showNotification } from '../../composables/useNotifications';
import { copyTextToClipboard } from '../../utils/copyTextToClipboard';
import { fileToDataURL } from '../../utils/fileToDataURL';
import type { IUser } from '../interfaces/interfaces';
import CachedAvatar from '../UI/CachedAvatar.vue';
import LinkIcon from '../UI/LinkIcon.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import MobileModal from '../UI/MobileModal.vue';

const callWindow = useDesktopCallWindowContext();

const props = defineProps<{
  open: boolean;
  isMobile: boolean;
  title: string;
  meta: string;
  members: IUser[];
  showOpenChat?: boolean;
  onCopyLink?: () => Promise<boolean | void>;
  onOpenChat?: () => Promise<boolean | void> | boolean | void;
}>();

const emits = defineEmits<{
  (e: 'close'): void;
}>();

const MAX_CUSTOM_WALLPAPER_SIZE_BYTES = 2 * 1024 * 1024;

const { openUserInfo } = useUserInfoModal();
const {
  callBackgroundPreviewItems,
  selectedCallBackgroundId,
  selectCallBackground,
  setCustomCallBackground
} = useCallBackground();

const callBackgroundInputRef = ref<HTMLInputElement | null>(null);
const callBackgroundError = ref('');
const isCallBackgroundMenuOpen = ref(false);

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

const notifyCopied = () => {
  showNotification({
    title: 'Скопировано',
    description: 'Ссылка на встречу скопирована',
    type: MessageTypeEnum.success
  });
};

const handleCopyLink = async () => {
  try {
    if (props.onCopyLink) {
      const result = await props.onCopyLink();
      if (result !== false) {
        notifyCopied();
      }
      return;
    }

    await copyTextToClipboard(window.location.href);
    notifyCopied();
  } catch (error) {
    console.warn('Failed to copy group call link', error);
  }
};

const handleOpenChat = async () => {
  if (!props.onOpenChat) {
    return;
  }

  try {
    await props.onOpenChat();
  } catch (error) {
    console.warn('Failed to open chat from group call panel', error);
  }
};

const handleOpenUserInfo = (user?: IUser): void => {
  if (!user) {
    return;
  }

  void callWindow?.showMain();
  openUserInfo(user, null, () => {
    void props.onOpenChat?.();
    emits('close');
  });
};

const toggleCallBackgroundMenu = (): void => {
  isCallBackgroundMenuOpen.value = !isCallBackgroundMenuOpen.value;
};

const selectCallBackgroundOption = (backgroundId: string): void => {
  callBackgroundError.value = '';
  selectCallBackground(backgroundId);
};

const openCallBackgroundPicker = (): void => {
  callBackgroundError.value = '';
  callBackgroundInputRef.value?.click();
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
    await setCustomCallBackground(dataUrl);
  } catch (error) {
    console.error('Failed to save custom call background:', error);
    callBackgroundError.value =
      'Не получилось сохранить фон на сервере. Проверьте соединение и попробуйте ещё раз';
  } finally {
    input.value = '';
  }
};
</script>
