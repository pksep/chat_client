<template>
  <section
    :class="['menu-profile', { 'menu-profile--collapse': props.isCollapse }]"
    :data-testid="`${props.dataTestid}-MenuProfilePanel-Container`"
  >
    <ChatsToolbar
      v-if="props.isCollapse"
      model-value=""
      :is-collapse="true"
      :data-testid="`${props.dataTestid}-MenuProfilePanel`"
      @create-chat="emits('create-chat')"
      @create-group="emits('create-group')"
      @create-bot="emits('create-bot')"
    />

    <div v-if="props.isCollapse" class="menu-profile__body">
      <div class="menu-profile__form">
        <div
          class="menu-profile__row menu-profile__row_theme"
          @click="themeStore.setTheme(!isDarkTheme)"
        >
          <div class="menu-profile__group">
            <Icon
              class="menu-profile__icon"
              :name="IconNameEnum.darkThemeSwitcher"
            />
            <div class="menu-profile__row-label">Тёмная тема</div>
          </div>

          <Toggle
            v-model="isDarkTheme"
            @click.stop
            theme="minor"
            @change="themeStore.setTheme"
          />
        </div>
      </div>
    </div>

    <MenuSectionHeading
      v-if="!props.isCollapse"
      as="h4"
      class="menu-profile__title"
      :data-testid="`${props.dataTestid}-MenuProfilePanel-Title`"
    >
      Профиль
    </MenuSectionHeading>
    <div v-if="authUser && !props.isCollapse" class="menu-profile__body">
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

        <div
          class="menu-profile__row menu-profile__row_theme"
          @click="themeStore.setTheme(!isDarkTheme)"
        >
          <div class="menu-profile__group">
            <Icon
              class="menu-profile__icon"
              :name="IconNameEnum.darkThemeSwitcher"
            />

            <div class="menu-profile__row-label">Тёмная тема</div>
          </div>

          <Toggle
            v-model="isDarkTheme"
            @click.stop
            theme="minor"
            @change="themeStore.setTheme"
          />
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
              v-if="props.isCollapse"
              class="menu-profile__status-trigger-plus"
              :name="IconNameEnum.plus"
              :width="24"
              :height="24"
            />
            <Icon
              :name="
                isStatusMenuOpen
                  ? IconNameEnum.chevronUp
                  : IconNameEnum.chevronDown
              "
              :width="24"
              :height="16"
            />
          </div>

          <div
            v-if="currentStatusLabel"
            class="menu-profile__status-current"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-CurrentStatus`"
            :role="props.isCollapse ? 'button' : undefined"
            :tabindex="props.isCollapse ? 0 : undefined"
            @click="props.isCollapse && toggleStatusMenu()"
            @keydown.enter="props.isCollapse && toggleStatusMenu()"
            @keydown.space.prevent="props.isCollapse && toggleStatusMenu()"
          >
            <span class="menu-profile__status-current-label">
              <EmojiIcon
                v-if="currentStatusIcon"
                class="menu-profile__status-option-icon"
                :emoji="currentStatusIcon"
              />
              <span>{{ currentStatusText }}</span>
            </span>
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
            <div
              v-for="option in statusPresets"
              :key="`${option.icon}-${option.text}`"
              class="menu-profile__status-option-row"
            >
              <button
                type="button"
                class="menu-profile__status-option"
                :disabled="isSavingStatus"
                @click="selectPreset(option)"
              >
                <EmojiIcon
                  class="menu-profile__status-option-icon"
                  :emoji="option.icon"
                />
                <span>{{ option.text }}</span>
              </button>
              <button
                v-if="option.custom"
                type="button"
                class="menu-profile__status-option-remove"
                :aria-label="`Удалить вариант «${option.text}»`"
                :title="`Удалить вариант «${option.text}»`"
                :disabled="isSavingStatus"
                @click.stop="removeStatusPreset(option)"
              >
                <Icon :name="IconNameEnum.closeTag" :width="16" :height="16" />
              </button>
            </div>

            <button
              type="button"
              class="menu-profile__status-option"
              :disabled="isSavingStatus"
              @click="openCustomStatus"
            >
              <EmojiIcon class="menu-profile__status-option-icon" emoji="🦄" />
              <span>Свой вариант</span>
            </button>
          </div>

          <div
            v-if="isCustomStatusOpen"
            class="menu-profile__status-custom"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-CustomStatus`"
          >
            <div class="menu-profile__status-custom__input__group">
              <button
                ref="statusEmojiButtonRef"
                type="button"
                class="menu-profile__status-emoji-button"
                aria-label="Выбрать эмодзи статуса"
                :aria-expanded="isEmojiPickerOpen"
                :disabled="isSavingStatus"
                @click="toggleEmojiPicker"
              >
                <Icon
                  v-if="!customStatusIcon"
                  :name="IconNameEnum.smile"
                  :width="20"
                  :height="20"
                />
                <EmojiIcon
                  v-else
                  class="menu-profile__status-emoji"
                  :emoji="customStatusIcon"
                />
              </button>
              <Input
                v-model="customStatusText"
                class="menu-profile__status-input"
                :maxlength="40"
                :hide-clear-button="true"
                aria-label="Текст статуса"
                :data-testid="`${props.dataTestid}-MenuProfilePanel-StatusInput`"
                placeholder="Выберите эмодзи и введите текст"
              />
            </div>
            <Teleport to="body">
              <div
                v-if="isEmojiPickerOpen"
                ref="statusEmojiPickerRef"
                class="menu-profile__status-emoji-picker"
                :style="statusEmojiPickerStyles"
                role="dialog"
                aria-label="Эмодзи статуса"
              >
                <EmojiPickerPanel @select="handleSelectEmoji" />
              </div>
            </Teleport>
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
              :height="16"
            />
          </div>

          <div
            v-if="isWallpaperMenuOpen"
            class="menu-profile__wallpapers-menu"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-WallpaperMenu`"
          >
            <div class="menu-profile__wallpapers-grid">
              <button
                v-for="wallpaper in displayedWallpaperPreviewItems"
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
                @contextmenu="
                  handleBackgroundContextMenu('wallpaper', wallpaper, $event)
                "
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
              :height="16"
            />
          </div>

          <div
            v-if="isCallBackgroundMenuOpen"
            class="menu-profile__wallpapers-menu"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-CallBackgroundMenu`"
          >
            <div class="menu-profile__wallpapers-grid">
              <button
                v-for="background in displayedCallBackgroundPreviewItems"
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
                @contextmenu="
                  handleBackgroundContextMenu('call', background, $event)
                "
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

        <StickerPackSelect
          :data-testid="`${props.dataTestid}-MenuProfilePanel-Stickers`"
        />

        <div v-if="isMobile" class="menu-profile__update">
          <div
            class="menu-profile__wallpapers-trigger"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateTrigger`"
            @click="toggleProfileUpdateMenu"
          >
            <div class="menu-profile__wallpapers-trigger-copy">
              <span class="menu-profile__wallpapers-trigger-title">
                Проверить обновления
              </span>
            </div>
            <Icon
              :name="
                isProfileUpdateMenuOpen
                  ? IconNameEnum.chevronUp
                  : IconNameEnum.chevronDown
              "
              :width="24"
              :height="16"
            />
          </div>

          <div
            v-if="isProfileUpdateMenuOpen"
            class="menu-profile__update-menu"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateMenu`"
          >
            <div class="menu-profile__update-content">
              <span
                v-if="profileUpdateStatusIconKind"
                :class="[
                  'menu-profile__update-status-icon',
                  `menu-profile__update-status-icon--${profileUpdateStatusIconKind}`
                ]"
                aria-hidden="true"
              >
                <svg
                  v-if="profileUpdateStatusIconKind === 'check'"
                  viewBox="0 0 18 18"
                  fill="none"
                >
                  <path
                    d="M5 9.2L7.7 12L13.2 6"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <svg v-else viewBox="0 0 18 18" fill="none">
                  <path
                    d="M14 11.25V14C14 14.2761 13.883 14.5412 13.6746 14.7366C13.4662 14.932 13.1836 15.0417 12.8889 15.0417H5.11111C4.81643 15.0417 4.53381 14.932 4.32544 14.7366C4.11706 14.5412 4 14.2761 4 14V11.25"
                    stroke="currentColor"
                    stroke-width="1.375"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M6.39587 7.95996L9.00003 10.5641L11.6042 7.95996"
                    stroke="currentColor"
                    stroke-width="1.375"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M9 10.5654V4.31543"
                    stroke="currentColor"
                    stroke-width="1.375"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
              <div class="menu-profile__update-copy">
                <p class="menu-profile__update-title">
                  {{ profileUpdateTitle }}
                </p>
                <p class="menu-profile__update-description">
                  {{ profileUpdateDescription }}
                </p>
              </div>

              <Button
                v-if="shouldShowProfileUpdateAction"
                :type="ButtonTypeEnum.primary"
                :size="SizesEnum.small"
                class="menu-profile__update-action"
                :disabled="isUpdateActionDisabled"
                :data-testid="`${props.dataTestid}-MenuProfilePanel-UpdateAction`"
                @click.stop="handleProfileUpdateClick"
              >
                {{ updateActionLabel }}
              </Button>

              <div
                v-else-if="profileUpdateState === 'downloading'"
                class="menu-profile__update-progress"
              >
                <span>{{ updateActionLabel }}</span>
                <FileIcon
                  :is-me-sender="false"
                  :is-loaded="false"
                  :percent="updateProgress"
                  background-color="var(--grey2)"
                />
              </div>

              <div
                v-else-if="profileUpdateState === 'checking'"
                class="menu-profile__update-progress menu-profile__update-progress--checking"
              >
                <FileIcon
                  :is-me-sender="false"
                  :is-loaded="false"
                  :percent="null"
                  background-color="var(--grey2)"
                />
              </div>

              <span
                v-else-if="profileUpdateState === 'latest'"
                class="menu-profile__update-check"
                aria-hidden="true"
              >
                <svg viewBox="0 0 18 18" fill="none">
                  <path
                    d="M5 9.2L7.7 12L13.2 6"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </span>
            </div>
          </div>
        </div>

        <div class="menu-profile__actions">
          <Button
            :type="ButtonTypeEnum.ghost"
            class="menu-profile__logout"
            :data-testid="`${props.dataTestid}-MenuProfilePanel-LogoutButton`"
            @click="openLogoutConfirmModal"
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

    <div v-else-if="!props.isCollapse" class="menu-panel menu-panel--centered">
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
            :is-dialog="true"
            data-testid="WallpaperPreview-Incoming"
          />
          <MessageBubble
            class="message__bubble message__other"
            :message="wallpaperPreviewOutgoingMessage"
            time="12:10"
            :is-me-sender="true"
            :is-read="true"
            :is-dialog="true"
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
            :is-dialog="true"
            data-testid="WallpaperPreview-Incoming"
          />
          <MessageBubble
            class="message__bubble message__other"
            :message="wallpaperPreviewOutgoingMessage"
            time="12:10"
            :is-me-sender="true"
            :is-read="true"
            :is-dialog="true"
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
    v-if="isCallBackgroundPreviewOpen"
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

  <Teleport to="body">
    <ContextMenu
      :visible="!!isOpen.background"
      :position="position"
      :data-testid="`${props.dataTestid}-MenuProfilePanel-BackgroundContextMenu`"
      @unmount-close="closeBackgroundContextMenu"
    >
      <Button
        class="red-context-button"
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        :data-testid="`${props.dataTestid}-MenuProfilePanel-BackgroundDeleteButton`"
        @click.stop="openBackgroundDeleteConfirm"
      >
        <Icon :name="IconNameEnum.deleteSmall" /> Удалить
      </Button>
    </ContextMenu>
  </Teleport>

  <ConfirmModal
    :open="!!pendingBackgroundDelete"
    title="Удалить фон"
    description="Вы уверены, что хотите удалить этот фон?"
    @unmount-close="closeBackgroundDeleteConfirm"
    @unmount-confirm="confirmBackgroundDelete"
  />

  <ConfirmModal
    :open="isLogoutConfirmModalOpen"
    title="Выход из профиля"
    description="Вы уверены, что хотите выйти?"
    @unmount-close="closeLogoutConfirmModal"
    @unmount-confirm="confirmLogout"
  />
</template>

<script setup lang="ts">
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';
import { storeToRefs } from 'pinia';
import Modal from '../UI/Modal.vue';
import MenuSectionHeading from '../UI/MenuSectionHeading.vue';
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxCircularEnum,
  EmojiPickerPanel,
  Icon,
  IconNameEnum,
  Input,
  SizesEnum,
  Toggle,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating
} from '@pksep/yui';
import {
  computed,
  defineAsyncComponent,
  ref,
  useTemplateRef,
  watch,
  type CSSProperties
} from 'vue';
import { onClickOutside, onKeyStroke } from '@vueuse/core';
import type { IUser, IUserStatus } from '../interfaces/interfaces';
import CachedAvatar from '../UI/CachedAvatar.vue';
import EmojiIcon from '../UI/EmojiIcon.vue';
import { preloadNotoEmojiAssets } from '../../composables/useEmojiStyle';
import { getAuthUser, logoutChatSession } from '../../composables/useAuth';
import {
  updateCurrentUserStatus,
  removeCurrentUserStatusPreset
} from '../../services/useUserStatus';
import {
  formatUserStatusLabel,
  formatUserStatusText,
  getCustomUserStatusPresets,
  normalizeUserStatus,
  USER_STATUS_PRESETS
} from '../../utils/userStatus';
import { useChatWallpaper } from '../../composables/useChatWallpaper';
import { useCallBackground } from '../../composables/useCallBackground';
import { useContextMenu } from '../../composables/useContextMenu';
import { fileToDataURL } from '../../utils/fileToDataURL';
import MobileModal from '../UI/MobileModal.vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import MessageBubble from '../Messages/MessageBubble.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import FileIcon from '../UI/FileIcon.vue';
import { useMobileApp } from '../../composables/useMobileApp';
import { useThemeStore } from '../../stores/theme';
import {
  isStatusPresetDesignPreview,
  statusPresetDesignPreview
} from './status-presets-design-preview';
import ChatsToolbar from './ChatsToolbar.vue';
import StickerPackSelect from './StickerPackSelect.vue';

const CallBackgroundPreviewModal = defineAsyncComponent(
  () => import('../CallModal/CallBackgroundPreviewModal.vue')
);

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
    isCollapse?: boolean;
  }>(),
  {
    dataTestid: 'MenuProfilePanel',
    isCollapse: false
  }
);

const emits = defineEmits<{
  (event: 'create-chat'): void;
  (event: 'create-group'): void;
  (event: 'create-bot'): void;
}>();

type BackgroundDeleteTarget = {
  kind: 'wallpaper' | 'call';
  id: string;
};

const themeStore = useThemeStore();
const { isDarkTheme } = storeToRefs(themeStore);
const authUser = computed(() => getAuthUser() as IUser | null);
const { state: isMobile } = useResizeState(MAX_W_MD);
const statusPresets = computed(() => [
  ...USER_STATUS_PRESETS.map(status => ({ ...status, custom: false })),
  ...(isStatusPresetDesignPreview
    ? statusPresetDesignPreview.value
    : getCustomUserStatusPresets(authUser.value?.ex, authUser.value?.status)
  ).map(status => ({ ...status, custom: true }))
]);
const MAX_CUSTOM_WALLPAPER_SIZE_BYTES = 2 * 1024 * 1024;
const isStatusMenuOpen = ref(false);
const isCustomStatusOpen = ref(false);
const isEmojiPickerOpen = ref(false);
useBackButtonHandler(
  isEmojiPickerOpen,
  () => {
    isEmojiPickerOpen.value = false;
  },
  BackButtonPriority.overlay
);
const statusEmojiButtonRef = useTemplateRef<HTMLButtonElement>(
  'statusEmojiButtonRef'
);
const statusEmojiPickerRef = useTemplateRef<HTMLDivElement>(
  'statusEmojiPickerRef'
);
const { floatingStyles: statusEmojiPickerStyles } = useFloating(
  statusEmojiButtonRef,
  statusEmojiPickerRef,
  {
    open: isEmojiPickerOpen,
    placement: 'top-start',
    strategy: 'fixed',
    middleware: [
      offset(8),
      flip({ padding: 8 }),
      shift({ padding: 8, crossAxis: true })
    ],
    whileElementsMounted: autoUpdate
  }
);
onClickOutside(
  statusEmojiPickerRef,
  () => {
    isEmojiPickerOpen.value = false;
  },
  { ignore: [statusEmojiButtonRef] }
);
onKeyStroke('Escape', event => {
  if (!isEmojiPickerOpen.value) return;
  event.preventDefault();
  isEmojiPickerOpen.value = false;
  statusEmojiButtonRef.value?.focus();
});
watch(isMobile, () => {
  isEmojiPickerOpen.value = false;
});
const isWallpaperMenuOpen = ref(false);
const isWallpaperPreviewOpen = ref(false);
const isApplyingWallpaper = ref(false);
const isCallBackgroundMenuOpen = ref(false);
const isCallBackgroundPreviewOpen = ref(false);
const isApplyingCallBackground = ref(false);
const isProfileUpdateMenuOpen = ref(false);
const isLogoutConfirmModalOpen = ref(false);
const activeBackgroundContextTarget = ref<BackgroundDeleteTarget | null>(null);
const pendingBackgroundDelete = ref<BackgroundDeleteTarget | null>(null);
const isDeletingBackground = ref(false);
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
  setCustomWallpaper,
  deleteCustomWallpaper
} = useChatWallpaper();
const {
  callBackgroundPreviewItems,
  selectedCallBackgroundId,
  selectCallBackground,
  setCustomCallBackground,
  deleteCustomCallBackground
} = useCallBackground();
const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();
const {
  updateActionLabel,
  updateProgress,
  profileUpdateState,
  isUpdateActionDisabled,
  currentAppVersion,
  handleUpdateClick
} = useMobileApp();

const currentStatusLabel = computed(() =>
  formatUserStatusLabel(authUser.value?.status)
);
const currentStatusIcon = computed(
  () => normalizeUserStatus(authUser.value?.status)?.icon || ''
);
const currentStatusText = computed(() =>
  formatUserStatusText(authUser.value?.status)
);
const shouldShowProfileUpdateAction = computed(
  () =>
    profileUpdateState.value === 'available' ||
    profileUpdateState.value === 'downloaded'
);
const profileUpdateStatusIconKind = computed<'download' | 'check' | null>(
  () => {
    if (profileUpdateState.value === 'downloaded') {
      return 'check';
    }

    if (
      profileUpdateState.value === 'available' ||
      profileUpdateState.value === 'downloading'
    ) {
      return 'download';
    }

    return null;
  }
);
const profileUpdateTitle = computed(() => {
  if (profileUpdateState.value === 'checking') {
    return 'Проверяем обновления';
  }

  if (profileUpdateState.value === 'downloading') {
    return 'Загружаем обновление';
  }

  if (profileUpdateState.value === 'downloaded') {
    return 'Установлено';
  }

  if (profileUpdateState.value === 'latest') {
    return 'Установлена новейшая версия';
  }

  if (profileUpdateState.value === 'available') {
    return 'Доступна новая версия';
  }

  return 'Проверить обновления';
});
const profileUpdateDescription = computed(() => {
  if (profileUpdateState.value === 'checking') {
    return 'Пожалуйста, подождите несколько секунд';
  }

  if (profileUpdateState.value === 'downloading') {
    return 'Пожалуйста, не закрывайте приложение';
  }

  if (profileUpdateState.value === 'downloaded') {
    return 'Для начала работы перезагрузите приложение';
  }

  if (profileUpdateState.value === 'latest') {
    return currentAppVersion.value
      ? `Сейчас у вас актуальная версия приложения ${currentAppVersion.value}`
      : 'Сейчас у вас актуальная версия приложения';
  }

  if (profileUpdateState.value === 'available') {
    return 'Обновите приложение, чтобы получить новые функции';
  }

  return 'Нажмите, чтобы проверить доступные обновления';
});

watch(isStatusMenuOpen, isOpen => {
  if (isOpen)
    preloadNotoEmojiAssets(
      [...statusPresets.value.map(option => option.icon), '🦄'],
      { highPriority: true }
    );
});

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
// Временная витрина для ручной проверки контекстного меню без изменения фонов пользователя.
// Удалить после подтверждения дизайна.
const isBackgroundContextMenuDesignPreview =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has(
    'preview-background-context-menu'
  );
const backgroundContextMenuDesignPreviewStyle: CSSProperties = {
  background:
    'linear-gradient(135deg, #d9ecff 0%, #b7d8ff 49%, #7facde 50%, #c6dcff 100%)'
};
const displayedWallpaperPreviewItems = computed(() =>
  isBackgroundContextMenuDesignPreview
    ? [
        {
          id: 'preview-custom-wallpaper',
          isCustom: true,
          previewStyle: backgroundContextMenuDesignPreviewStyle
        },
        ...wallpaperPreviewItems.value
      ]
    : wallpaperPreviewItems.value
);
const displayedCallBackgroundPreviewItems = computed(() =>
  isBackgroundContextMenuDesignPreview
    ? [
        {
          id: 'preview-custom-call-background',
          isCustom: true,
          previewStyle: backgroundContextMenuDesignPreviewStyle
        },
        ...callBackgroundPreviewItems.value
      ]
    : callBackgroundPreviewItems.value
);

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

const toggleProfileUpdateMenu = (): void => {
  isProfileUpdateMenuOpen.value = !isProfileUpdateMenuOpen.value;
};

const handleProfileUpdateClick = async (): Promise<void> => {
  await handleUpdateClick();
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

const openLogoutConfirmModal = (): void => {
  isLogoutConfirmModalOpen.value = true;
};

const closeLogoutConfirmModal = (): void => {
  isLogoutConfirmModalOpen.value = false;
};

const handleBackgroundContextMenu = (
  kind: BackgroundDeleteTarget['kind'],
  background: { id: string; isCustom: boolean },
  event: MouseEvent
): void => {
  if (!background.isCustom) {
    return;
  }

  activeBackgroundContextTarget.value = { kind, id: background.id };
  openActivePopover('background', event);
};

const closeBackgroundContextMenu = (): void => {
  activeBackgroundContextTarget.value = null;
  closeActivePopover('background');
};

const openBackgroundDeleteConfirm = (): void => {
  if (!activeBackgroundContextTarget.value) {
    return;
  }

  pendingBackgroundDelete.value = { ...activeBackgroundContextTarget.value };
  closeBackgroundContextMenu();
};

const closeBackgroundDeleteConfirm = (): void => {
  if (isDeletingBackground.value) {
    return;
  }

  pendingBackgroundDelete.value = null;
};

const confirmBackgroundDelete = async (): Promise<void> => {
  const target = pendingBackgroundDelete.value;

  if (!target || isDeletingBackground.value) {
    return;
  }

  isDeletingBackground.value = true;

  try {
    if (target.kind === 'wallpaper') {
      wallpaperError.value = '';
      await deleteCustomWallpaper(target.id);
    } else {
      callBackgroundError.value = '';
      await deleteCustomCallBackground(target.id);
    }
    pendingBackgroundDelete.value = null;
  } catch (error) {
    console.error('Failed to delete custom background:', error);
    const message = 'Не удалось удалить фон. Попробуйте ещё раз';
    if (target.kind === 'wallpaper') {
      wallpaperError.value = message;
    } else {
      callBackgroundError.value = message;
    }
    pendingBackgroundDelete.value = null;
  } finally {
    isDeletingBackground.value = false;
  }
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
      'Не получилось сохранить фон на сервере. Проверьте соединение и попробуйте ещё раз';
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
      'Не получилось сохранить фон на сервере. Проверьте соединение и попробуйте ещё раз';
    isApplyingCallBackground.value = false;
  }
};

const handleSelectEmoji = (emoji: { i: string }): void => {
  customStatusIcon.value = emoji.i;
  isEmojiPickerOpen.value = false;
  statusEmojiButtonRef.value?.focus();
};

const saveStatus = async (status: IUserStatus | null): Promise<void> => {
  if (isStatusPresetDesignPreview) return;
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

const removeStatusPreset = async (status: IUserStatus): Promise<void> => {
  if (isStatusPresetDesignPreview) {
    statusPresetDesignPreview.value = statusPresetDesignPreview.value.filter(
      option => option.icon !== status.icon || option.text !== status.text
    );
    return;
  }
  if (isSavingStatus.value) return;
  statusError.value = '';
  isSavingStatus.value = true;
  try {
    await removeCurrentUserStatusPreset(status);
  } catch (error) {
    console.error('Не получилось удалить вариант статуса:', error);
    statusError.value =
      'Не получилось удалить вариант статуса. Попробуйте ещё раз';
  } finally {
    isSavingStatus.value = false;
  }
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

const handleLogout = async (): Promise<void> => {
  await logoutChatSession();
};

const confirmLogout = (): void => {
  closeLogoutConfirmModal();
  void handleLogout();
};
</script>
