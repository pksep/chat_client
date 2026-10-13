<template>
  <div
    ref="inputContainerRef"
    class="chat__input emoji-font-host"
    :class="{ 'chat__input--booting': !isEditorReady }"
    :data-testid="`${props.dataTestid}-MessageList-InputContainer`"
    @pointerdown.capture="handleContentEditorPointerDown"
    @click.capture="handleContentEditorPopoverClick"
  >
    <button
      v-if="!isEditorReady"
      type="button"
      class="chat__input-skeleton"
      aria-label="Загрузка поля ввода"
      :data-testid="`${props.dataTestid}-MessageList-InputSkeleton`"
      @pointerdown.prevent="handleInputSkeletonPointerDown"
    >
      <SkeletonBlock class="chat__input-skeleton__text" />
      <span class="chat__input-skeleton__toolbar" aria-hidden="true">
        <SkeletonBlock
          v-for="index in 6"
          :key="index"
          class="chat__input-skeleton__toolbar-button"
        />
      </span>
    </button>
    <div
      class="chat__input-editor"
      :data-testid="`${props.dataTestid}-MessageList-ContentEditor`"
    >
      <ContentEditor
        :active-send="props.forwardMessages.length > 0 || props.allowEmptySend"
        v-model="internalInputText"
        ref="contentEditorRef"
        :attachment-draft-key="composerDraftKey"
        :active-attach-file="props.allowAttachFile"
        :active-select-user="allowMentionUsers"
        :active-select-slash="isBotChat && botCommands.length > 0"
        :mention-items="users"
        :mention-config="mentionConfig"
        :slash-items="botCommands"
        :slash-config="slashConfig"
        :read-clipboard-text="readClipboardText"
        :stickers="[]"
        @unmount-sticker="emit('sendSticker', $event)"
        @unmount-send="handleSend"
        @unmount-attach-file="(...args: any[]) => $emit('attachFile', ...args)"
        @mention-change="handleMentionChange"
        @slash-change="handleSlashChange"
        @vue:mounted="handleEditorMounted"
      >
        <template v-if="props.showCallTopicActionsToggle" #mobile-right-action>
          <button
            type="button"
            class="chat__input-prompt-toggle"
            :class="{
              'chat__input-prompt-toggle--active': props.isCallTopicActionsOpen
            }"
            :aria-expanded="props.isCallTopicActionsOpen"
            :aria-label="
              props.isCallTopicActionsOpen
                ? 'Скрыть промпты звонка'
                : 'Показать промпты звонка'
            "
            :data-testid="`${props.dataTestid}-CallTopicActionsToggle`"
            @click.stop="$emit('toggleCallTopicActions')"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect x="4" y="4" width="6" height="6" rx="1.5" />
              <rect x="14" y="4" width="6" height="6" rx="1.5" />
              <rect x="4" y="14" width="6" height="6" rx="1.5" />
              <rect x="14" y="14" width="6" height="6" rx="1.5" />
            </svg>
          </button>
        </template>
        <template v-if="!!props.editMessage" #action>
          <div
            class="chat__input__action"
            @click="$emit('scrollToMessage', props.editMessage)"
          >
            <EditIcon />
            <div class="chat__input__action__blog">
              <h5>Редактирование</h5>
              <p v-emoji>
                {{ stripHtml(props.editMessage?.text || '') }}
              </p>
            </div>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.little"
              @click="$emit('clearEdit')"
              :data-testid="`${props.dataTestid}-MenuInfo-CloseButton`"
            >
              <Icon :name="IconNameEnum.crossLarge" />
            </Button>
          </div>
        </template>
        <template v-else-if="!!props.replyMessage" #action>
          <div
            class="chat__input__action"
            @click="$emit('scrollToMessage', props.replyMessage)"
          >
            <div class="chat__input__action__blog">
              <h5>{{ replyActionTitle }}</h5>
              <p v-emoji>
                {{ replyActionDescription }}
              </p>
            </div>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.little"
              @click="$emit('clearReply')"
              :data-testid="`${props.dataTestid}-MenuInfo-CloseButton`"
            >
              <Icon
                :name="IconNameEnum.crossLarge"
                color="var(--chat-secondary)"
              />
            </Button>
          </div>
        </template>
        <template v-else-if="props.forwardMessages.length > 0" #action>
          <div
            class="chat__input__action"
            @click="
              props.forwardMessages[0] &&
                $emit('scrollToMessage', props.forwardMessages[0])
            "
          >
            <ForwardIcon />
            <div class="chat__input__action__blog">
              <h5>
                Переслать {{ props.forwardMessages.length }}
                сообщение
              </h5>
              <p v-emoji>
                <template v-if="props.forwardMessages.length === 1">
                  {{ props.forwardMessages[0]?.senderUser?.initials }}:
                  {{ stripHtml(props.forwardMessages[0]?.text || 'Вложение') }}
                </template>
                <template v-else>
                  {{ formatForwardMessagesLabel(props.forwardMessages.length) }}
                </template>
              </p>
            </div>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.little"
              @click="$emit('clearForward')"
              :data-testid="`${props.dataTestid}-MenuInfo-CloseButton`"
            >
              <Icon
                :name="IconNameEnum.crossLarge"
                color="var(--chat-secondary)"
              />
            </Button>
          </div>
        </template>
        <template
          v-else-if="props.customActionTitle || props.customActionDescription"
          #action
        >
          <div class="chat__input__action">
            <div class="chat__input__action__blog">
              <h5 v-if="props.customActionTitle">
                {{ props.customActionTitle }}
              </h5>
              <p v-emoji v-if="props.customActionDescription">
                {{ props.customActionDescription }}
              </p>
            </div>
          </div>
        </template>
      </ContentEditor>
    </div>
    <ChatStickerPicker
      :host="inputContainerRef"
      :enabled="canUseStickers"
      @select="emit('sendSticker', $event)"
    />
    <Teleport to="body">
      <div
        v-if="isTauriFileDragging"
        class="chat__input-tauri-dropzone"
        :data-testid="`${props.dataTestid}-MessageList-TauriDropzone`"
      >
        <div class="chat__input-tauri-dropzone__zone">
          <div class="chat__input-tauri-dropzone__title">Загрузить файл</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script lang="ts" setup>
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  reactive,
  ref,
  useTemplateRef,
  watch
} from 'vue';
import {
  Button,
  ButtonTypeEnum,
  ContentEditor,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import EditIcon from '../UI/EditIcon.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import SkeletonBlock from '../UI/SkeletonBlock.vue';
import { stripHtml } from '../../utils/stripHtml';
import ChatStickerPicker from './ChatStickerPicker.vue';
import { bindKeyboardMedia } from '../../services/useKeyboardMedia';
import { bindChatClipboardPaste } from '../../services/useChatClipboard';
import { useManagerInquiries } from '../../composables/useManagerInquiries';
import type { IMessage } from '../interfaces/interfaces';
import { currentGroup } from '../../composables/useGroup';
import { getSelectedTopic } from '../../composables/useTopics';
import { getUserLastOnline } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';
import {
  getCachedBotCommands,
  loadBotCommandsViaGateway
} from '../../composables/useBots';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { getConfig } from '../../services/useConfig';
import {
  getHasWebsocketConnection,
  sendTypingStatus
} from '../../services/useChat';
import { bindTauriFileDrop } from '../../services/useTauriDroppedFiles';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';
import {
  type BotCommand,
  getBotCommands,
  getBotId,
  isBotTopic,
  isDeletedBotUser
} from '../../utils/bot';
import {
  matchesUserSearch,
  normalizeAtSearchQuery
} from '../../utils/searchMatch';
import { useManagerRouteSubscription } from '../../composables/useManagerRoutes';

interface Props {
  topicId?: string;
  dataTestid: string;
  modelValue: string;
  editMessage: IMessage | null;
  replyMessage: IMessage | null;
  forwardMessages: IMessage[];
  allowEmptySend?: boolean;
  allowAttachFile?: boolean;
  allowSelectUser?: boolean;
  customActionTitle?: string;
  customActionDescription?: string;
  showCallTopicActionsToggle?: boolean;
  isCallTopicActionsOpen?: boolean;
}

interface IContentEditorSendPayload {
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}

type BotCommandItem = BotCommand & {
  avatarUrl?: string;
};

const props = withDefaults(defineProps<Props>(), {
  allowEmptySend: false,
  allowAttachFile: true,
  allowSelectUser: true,
  customActionTitle: '',
  customActionDescription: '',
  showCallTopicActionsToggle: false,
  isCallTopicActionsOpen: false
});
const managerTopicId = computed(() => props.topicId);
useManagerRouteSubscription(managerTopicId);

const TYPING_IDLE_TIMEOUT_MS = 2500;
const TYPING_PING_INTERVAL_MS = 2000;

const emit = defineEmits([
  'update:modelValue',
  'send',
  'sendSticker',
  'sendKeyboardMedia',
  'attachFile',
  'clearEdit',
  'clearReply',
  'clearForward',
  'scrollToMessage',
  'heightChange',
  'ready',
  'toggleCallTopicActions'
]);

const internalInputText = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
});

const canUseStickers = computed(
  () =>
    !props.editMessage &&
    route.value.type !== RouteTypes.AI &&
    !useManagerInquiries().byTopic.value.has(props.topicId || route.value.id)
);

const replyActionTitle = computed(() => {
  if (props.replyMessage?.replyQuoteText) {
    return 'Ответить на фрагмент';
  }

  return `В ответ ${props.replyMessage?.senderUser?.initials || ''}`.trim();
});

const replyActionDescription = computed(() =>
  stripHtml(
    props.replyMessage?.replyQuoteText || props.replyMessage?.text || 'Вложение'
  )
);

const formatForwardMessagesLabel = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${count} сообщение`;
  }

  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return `${count} сообщения`;
  }

  return `${count} сообщений`;
};

const route = useUrlWatcher();
const composerDraftKey = computed(
  () => `${route.value.type}:${route.value.id || 'default'}`
);
const config = getConfig();
const activeTopic = computed(() =>
  route.value.id ? getSelectedTopic(route.value.id) : undefined
);
const isBotChat = computed(() => isBotTopic(activeTopic.value));
const allowMentionUsers = computed(
  () => props.allowSelectUser && route.value.type === RouteTypes.GROUP
);

const BOT_FALLBACK_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg width="27" height="27" viewBox="0 0 27 27" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="27" height="27" rx="13.5" fill="url(#pattern0_39192_4744)"/>
<defs>
<pattern id="pattern0_39192_4744" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0_39192_4744" transform="scale(0.005)"/>
</pattern>
<image id="image0_39192_4744" width="200" height="200" preserveAspectRatio="none" xlink:href="data:image/png;base64,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"/>
</defs>
</svg>
`
)}`;

const isAbsoluteOrLocalUrl = (path?: string | null): boolean =>
  !!path && /^(blob:|data:|https?:\/\/|file:\/\/|\/)/i.test(path);

const resolveAvatarUrl = (path?: string | null): string => {
  if (!path) {
    return '';
  }

  if (isAbsoluteOrLocalUrl(path)) {
    return path;
  }

  return `${config.CHAT_PATH_TO_FILE_CDN}/${path}`;
};

const state = reactive({
  mentionSearch: '',
  slashSearch: ''
});

const mentionConfig = {
  getKey: (user: any) => user.id,
  getLabel: (user: any) => user.initials || 'User',
  getSubtitle: (user: any) => {
    const ex = typeof user.ex === 'string' ? JSON.parse(user.ex) : user.ex;

    return ex?.erpInitials || '';
  },
  getAvatarUrl: (user: any) => resolveAvatarUrl(user.avatarUrl),
  getAvatarInitials: (user: any) => user.initials || user.nickname || 'U',
  getIsOnline: (user: any) =>
    getHasWebsocketConnection() &&
    !isDeletedBotUser(user) &&
    !getUserLastOnline(user) &&
    getAuthUser()?.id !== user.id,
  getInsertLabel: (user: any) => `@${user.initials || 'User'} `,
  getInsertAttrs: (user: any) => ({ userId: user.id })
};

const slashConfig = {
  getKey: (command: BotCommandItem) => command.command,
  getLabel: (command: BotCommandItem) => command.command,
  getSubtitle: (command: BotCommandItem) => command.description,
  getAvatarUrl: (command: BotCommandItem) => command.avatarUrl || '',
  getAvatarDefaultImage: () => BOT_FALLBACK_AVATAR,
  getAvatarInitials: () => '',
  getIsOnline: () => false,
  getInsertLabel: (command: BotCommandItem) => `${command.command} `
};

const handleSend = (payload?: IContentEditorSendPayload) => {
  void stopTyping();

  const tiptapEditor = contentEditorRef.value?.editor;
  if (!tiptapEditor) return;

  const usersSet = new Set<string>();

  tiptapEditor.state.doc.descendants(node => {
    if (node.type.name === 'spanNode' && node.attrs.userId) {
      usersSet.add(node.attrs.userId);
    }
  });

  const uniqueUsers = Array.from(usersSet);

  emit('send', {
    taggedUserIds: uniqueUsers,
    content: payload?.content,
    files: payload?.files,
    mediaFiles: payload?.mediaFiles
  });
};

const handleMentionChange = (search: string | null) => {
  if (search !== null) {
    state.mentionSearch = search;
  } else {
    state.mentionSearch = '';
  }
};

const handleSlashChange = (search: string | null) => {
  if (search !== null) {
    state.slashSearch = search;
  } else {
    state.slashSearch = '';
  }
};

const users = computed(() => {
  const allMembers =
    route.value.type === RouteTypes.GROUP
      ? (currentGroup.value?.members || []).filter(
          member => !isDeletedBotUser(member)
        )
      : [];
  const query = normalizeAtSearchQuery(state.mentionSearch);

  if (!query) return allMembers;

  return allMembers.filter(user => matchesUserSearch(user, query));
});

const botCommands = computed(() => {
  if (!isBotChat.value) {
    return [];
  }

  const botUser = activeTopic.value?.user;
  const cachedCommands = getCachedBotCommands(getBotId(botUser), botUser?.id);
  const commands = (cachedCommands ?? getBotCommands(botUser)).map(command => ({
    ...command,
    avatarUrl: resolveAvatarUrl(botUser?.avatarUrl)
  }));

  if (!state.slashSearch) {
    return commands;
  }

  const search = state.slashSearch.toLowerCase();

  return commands.filter(command =>
    `${command.command} ${command.description}`.toLowerCase().includes(search)
  );
});

const contentEditorRef =
  useTemplateRef<typeof ContentEditor>('contentEditorRef');
const inputContainerRef = useTemplateRef<HTMLElement>('inputContainerRef');
const isTauriFileDragging = ref(false);
const isEditorReady = ref(false);
let shouldFocusEditorWhenReady = false;

const handleEditorMounted = async (): Promise<void> => {
  await nextTick();
  // EditorContent переносит DOM редактора в собственном nextTick после mounted.
  // Перед кадром все дочерние обновления закончены и высота композера известна.
  requestAnimationFrame(reportInputHeight);
};
let hasReportedEditorReady = false;

const handleInputSkeletonPointerDown = (): void => {
  shouldFocusEditorWhenReady = true;
};

const handleContentEditorPointerDown = (event: PointerEvent): void => {
  const target = event.target;

  if (
    !(target instanceof HTMLInputElement) ||
    !target.closest('.emoji-picker .v3-search')
  ) {
    return;
  }

  event.stopPropagation();
  target.focus({ preventScroll: true });
};

const handleContentEditorPopoverClick = (event: MouseEvent): void => {
  const root = inputContainerRef.value;
  const target = event.target;

  if (!root || !(target instanceof Element)) {
    return;
  }

  if (target.closest('.attach-file-button')) {
    const emojiPicker = Array.from(
      root.querySelectorAll<HTMLElement>('.emoji-picker')
    ).find(element => element.offsetParent);

    if (emojiPicker) {
      Array.from(root.querySelectorAll<HTMLButtonElement>('.smile-button'))
        .find(element => element.offsetParent)
        ?.click();
    }

    return;
  }

  if (target.closest('.smile-button')) {
    root
      .querySelector<HTMLElement>('.popover-yui-kit__wrapper.active-yui-kit')
      ?.click();
  }
};

let typingStopTimeout: ReturnType<typeof setTimeout> | null = null;
let isTypingActive = false;
let activeTypingTopicId: string | null = null;
let lastTypingPingAt = 0;
let unlistenTauriFileDrop: (() => void) | null = null;
let unlistenKeyboardMedia: (() => void) | null = null;
let chatClipboard: ReturnType<typeof bindChatClipboardPaste> | null = null;
let keyboardMediaDisposed = false;
let inputResizeObserver: ResizeObserver | null = null;
let inputMutationObserver: MutationObserver | null = null;
let lastReportedInputHeight = 0;

const clearTypingStopTimeout = (): void => {
  if (!typingStopTimeout) {
    return;
  }

  clearTimeout(typingStopTimeout);
  typingStopTimeout = null;
};

const getHasDraftText = (value: string): boolean =>
  stripHtml(value || '')
    .replace(/\u00a0/g, ' ')
    .trim().length > 0;

const stopTyping = async (topicId = activeTypingTopicId): Promise<void> => {
  clearTypingStopTimeout();

  if (!topicId || !isTypingActive) {
    activeTypingTopicId = topicId ?? null;
    return;
  }

  isTypingActive = false;
  activeTypingTopicId = null;
  lastTypingPingAt = 0;
  await sendTypingStatus({
    topicId,
    isTyping: false
  });
};

const scheduleTypingStop = (topicId: string): void => {
  clearTypingStopTimeout();
  typingStopTimeout = setTimeout(() => {
    void stopTyping(topicId);
  }, TYPING_IDLE_TIMEOUT_MS);
};

const notifyTyping = async (): Promise<void> => {
  const topicId = route.value.id;

  if (
    !topicId ||
    route.value.type === RouteTypes.AI ||
    !getHasWebsocketConnection()
  ) {
    return;
  }

  const now = Date.now();
  const shouldPing =
    !isTypingActive ||
    activeTypingTopicId !== topicId ||
    now - lastTypingPingAt >= TYPING_PING_INTERVAL_MS;

  activeTypingTopicId = topicId;
  scheduleTypingStop(topicId);

  if (!shouldPing) {
    return;
  }

  isTypingActive = true;
  lastTypingPingAt = now;
  await sendTypingStatus({
    topicId,
    isTyping: true
  });
};

const toFileList = (files: File[]): FileList => {
  const dataTransfer = new DataTransfer();

  files.forEach(file => dataTransfer.items.add(file));

  return dataTransfer.files;
};

const isMediaFile = (file: File): boolean => {
  const type = file.type.toLowerCase();

  return type.startsWith('image/') || type.startsWith('video/');
};

const readClipboardText = async (): Promise<string> => {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Clipboard.read();

    return value || '';
  }

  return (await navigator.clipboard?.readText?.()) || '';
};

const reportInputHeight = (): void => {
  const element = inputContainerRef.value;

  if (!element) {
    return;
  }

  const nextHeight = Math.ceil(element.getBoundingClientRect().height);

  if (
    !hasReportedEditorReady &&
    element.querySelector('.ProseMirror[contenteditable="true"]')
  ) {
    hasReportedEditorReady = true;
    isEditorReady.value = true;

    if (shouldFocusEditorWhenReady) {
      shouldFocusEditorWhenReady = false;
      nextTick(() => contentEditorRef.value?.focus());
    }
  }

  if (!nextHeight || nextHeight === lastReportedInputHeight) {
    return;
  }

  lastReportedInputHeight = nextHeight;
  emit('heightChange', nextHeight);
};

const handleTauriFilesDropped = (files: File[]): void => {
  isTauriFileDragging.value = false;

  if (!files.length || !props.allowAttachFile) {
    return;
  }

  const onlyMedia = files.every(isMediaFile);
  const editor = contentEditorRef.value as typeof contentEditorRef.value & {
    queueAttachFiles?: (files: FileList | File[], onlyMedia: boolean) => void;
  };

  if (editor?.queueAttachFiles) {
    editor.queueAttachFiles(files, onlyMedia);
    return;
  }

  emit('attachFile', toFileList(files), onlyMedia);
};

defineExpose({
  focus: () => contentEditorRef.value?.focus(),
  pasteCopiedContent: () =>
    chatClipboard?.pasteFromClipboard() ?? Promise.resolve(false),
  insertText: (text: string) =>
    contentEditorRef.value?.editor?.commands?.insertContent?.(text),
  insertPlainText: (text: string) =>
    contentEditorRef.value?.editor?.commands?.insertContent?.({
      type: 'text',
      text
    }),
  getRootElement: () => inputContainerRef.value
});

watch(
  () => internalInputText.value,
  value => {
    nextTick(() => {
      requestAnimationFrame(reportInputHeight);
    });

    if (getHasDraftText(value)) {
      void notifyTyping();
      return;
    }

    void stopTyping();
  }
);

watch(
  () => route.value.id,
  (nextTopicId, previousTopicId) => {
    if (previousTopicId && previousTopicId !== nextTopicId) {
      void stopTyping(previousTopicId);
    }
  }
);

watch(
  composerDraftKey,
  async draftKey => {
    state.mentionSearch = '';
    state.slashSearch = '';
    await nextTick();
    if (draftKey !== composerDraftKey.value || !inputContainerRef.value) return;
    reportInputHeight();
    emit('ready');
  },
  { flush: 'post' }
);

watch(
  () => activeTopic.value?.user?.id,
  () => {
    if (!isBotChat.value) {
      return;
    }

    void loadBotCommandsViaGateway(activeTopic.value).catch(() => undefined);
  },
  { immediate: true }
);

onMounted(() => {
  chatClipboard = bindChatClipboardPaste({
    getTargetElement: () => inputContainerRef.value,
    getTopicId: () => props.topicId || route.value.id,
    canPasteSticker: () => canUseStickers.value,
    canPasteMedia: () =>
      props.allowAttachFile &&
      !props.editMessage &&
      route.value.type !== RouteTypes.AI,
    onSticker: sticker => emit('sendSticker', sticker),
    onKeyboardSticker: file => emit('sendKeyboardMedia', file),
    onMedia: ({ file, isMedia }) => {
      void contentEditorRef.value?.queueAttachFiles([file], isMedia);
    }
  });
  void bindKeyboardMedia({
    getTargetElement: () =>
      canUseStickers.value ? inputContainerRef.value : null,
    onMedia: file => emit('sendKeyboardMedia', file)
  }).then(unlisten => {
    if (keyboardMediaDisposed) unlisten?.();
    else unlistenKeyboardMedia = unlisten;
  });
  if ('ResizeObserver' in window && inputContainerRef.value) {
    inputResizeObserver = new ResizeObserver(reportInputHeight);
    inputResizeObserver.observe(inputContainerRef.value);
  }

  if ('MutationObserver' in window && inputContainerRef.value) {
    inputMutationObserver = new MutationObserver(reportInputHeight);
    inputMutationObserver.observe(inputContainerRef.value, {
      childList: true,
      subtree: true
    });
  }

  requestAnimationFrame(() => {
    reportInputHeight();
    emit('ready');
  });

  void bindTauriFileDrop({
    getTargetElement: () =>
      props.allowAttachFile ? inputContainerRef.value : null,
    onDragStateChange: isDragging => {
      isTauriFileDragging.value = isDragging;
    },
    onFilesDropped: handleTauriFilesDropped
  }).then(unlisten => {
    unlistenTauriFileDrop = unlisten;
  });
});

onBeforeUnmount(() => {
  keyboardMediaDisposed = true;
  inputResizeObserver?.disconnect();
  inputResizeObserver = null;
  inputMutationObserver?.disconnect();
  inputMutationObserver = null;
  lastReportedInputHeight = 0;
  emit('heightChange', 0);
  unlistenTauriFileDrop?.();
  unlistenKeyboardMedia?.();
  chatClipboard?.dispose();
  void stopTyping();
});
</script>

<style scoped>
.chat__input--booting {
  min-height: 75px;
}

.chat__input--booting > .chat__input-editor {
  position: absolute;
  top: 0;
  left: 15px;
  right: 10px;
  visibility: hidden;
  pointer-events: none;
}

.chat__input-skeleton {
  box-sizing: border-box;
  width: 100%;
  min-height: 105px;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  border: 0.5px solid var(--border-table);
  border-radius: 20px;
  background: var(--surface-input-primary);
  cursor: text;
}

.chat__input-skeleton__text {
  width: min(36%, 260px);
  height: 14px;
  margin: 20px 16px;
  border-radius: 5px;
}

.chat__input-skeleton__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  margin: 0 16px 16px;
}

.chat__input-skeleton__toolbar-button {
  width: 30px;
  height: 30px;
  border-radius: 7px;
}

.chat__input-skeleton__toolbar-button:last-child {
  margin-left: auto;
}

@media screen and (width <= 480px) {
  .chat__input--booting > .chat__input-editor {
    top: 5px;
    left: 10px;
  }

  .chat__input-skeleton {
    grid-template-columns: 22px minmax(0, 1fr) 22px;
    grid-template-rows: 1fr;
    align-items: center;
    gap: 10px;
    height: 50px;
    min-height: 50px;
    padding: 0 14px;
    border-width: 1px;
    border-radius: 30px;
  }

  .chat__input-skeleton__text {
    grid-column: 2;
    grid-row: 1;
    width: min(42%, 150px);
    margin: 0;
  }

  .chat__input-skeleton__toolbar {
    display: contents;
  }

  .chat__input-skeleton__toolbar-button {
    display: none;
    width: 22px;
    height: 22px;
    margin: 0;
    border-radius: 50%;
  }

  .chat__input-skeleton__toolbar-button:first-child,
  .chat__input-skeleton__toolbar-button:last-child {
    display: block;
    grid-row: 1;
  }

  .chat__input-skeleton__toolbar-button:first-child {
    grid-column: 1;
  }

  .chat__input-skeleton__toolbar-button:last-child {
    grid-column: 3;
  }
}

.chat__input-prompt-toggle {
  width: 30px;
  height: 30px;
  min-width: 30px;
  min-height: 30px;
  display: grid;
  place-items: center;
  padding: 3px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.chat__input-prompt-toggle svg {
  width: 24px;
  height: 24px;
  fill: none;
}

.chat__input-prompt-toggle rect {
  stroke: currentColor;
  stroke-width: 1.6;
}

.chat__input-prompt-toggle--active {
  color: var(--text-brand);
}
</style>
