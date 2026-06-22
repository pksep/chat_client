<template>
  <div
    ref="inputContainerRef"
    class="chat__input emoji-font-host"
    :data-testid="`${props.dataTestid}-MessageList-InputContainer`"
  >
    <div :data-testid="`${props.dataTestid}-MessageList-ContentEditor`">
      <ContentEditor
        :active-send="props.forwardMessages.length > 0 || props.allowEmptySend"
        v-model="internalInputText"
        ref="contentEditorRef"
        :active-attach-file="props.allowAttachFile"
        :active-select-user="props.allowSelectUser"
        :mention-items="users"
        :mention-config="mentionConfig"
        :read-clipboard-text="readClipboardText"
        @unmount-send="handleSend"
        @unmount-attach-file="(...args: any[]) => $emit('attachFile', ...args)"
        @mention-change="handleMentionChange"
      >
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
              <Icon
                :name="IconNameEnum.crossLarge"
                color="var(--text-neutral-color)"
              />
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
                color="var(--text-neutral-color)"
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
                color="var(--text-neutral-color)"
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
import { stripHtml } from '../../utils/stripHtml';
import type { IMessage } from '../interfaces/interfaces';
import { currentGroup } from '../../composables/useGroup';
import { getUserLastOnline } from '../../composables/useUsers';
import { getAuthUser } from '../../composables/useAuth';
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

interface Props {
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
}

interface IContentEditorSendPayload {
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}

const props = withDefaults(defineProps<Props>(), {
  allowEmptySend: false,
  allowAttachFile: true,
  allowSelectUser: true,
  customActionTitle: '',
  customActionDescription: ''
});
const TYPING_IDLE_TIMEOUT_MS = 2500;
const TYPING_PING_INTERVAL_MS = 2000;

const emit = defineEmits([
  'update:modelValue',
  'send',
  'attachFile',
  'clearEdit',
  'clearReply',
  'clearForward',
  'scrollToMessage'
]);

const internalInputText = computed({
  get: () => props.modelValue,
  set: val => emit('update:modelValue', val)
});

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
const config = getConfig();

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
  mentionSearch: ''
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
    !getUserLastOnline(user) &&
    getAuthUser()?.id !== user.id,
  getInsertLabel: (user: any) => `@${user.initials || 'User'} `,
  getInsertAttrs: (user: any) => ({ userId: user.id })
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

const users = computed(() => {
  const allMembers =
    route.value.type === RouteTypes.GROUP
      ? currentGroup.value?.members || []
      : [];

  if (!state.mentionSearch) return allMembers;

  return allMembers.filter(user => {
    const nameMatch = (user.nickname || '')
      .toLowerCase()
      .includes(state.mentionSearch);
    const erpInitialsMatch = (
      typeof user.ex === 'string' ? JSON.parse(user.ex) : user.ex
    )?.erpInitials
      ?.toLowerCase()
      ?.includes(state.mentionSearch);
    const initialsMatch = (user.initials || '')
      .toLowerCase()
      .includes(state.mentionSearch);
    return nameMatch || erpInitialsMatch || initialsMatch;
  });
});

const contentEditorRef =
  useTemplateRef<typeof ContentEditor>('contentEditorRef');
const inputContainerRef = useTemplateRef<HTMLElement>('inputContainerRef');
const isTauriFileDragging = ref(false);

let typingStopTimeout: ReturnType<typeof setTimeout> | null = null;
let isTypingActive = false;
let activeTypingTopicId: string | null = null;
let lastTypingPingAt = 0;
let unlistenTauriFileDrop: (() => void) | null = null;

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
  insertText: (text: string) =>
    contentEditorRef.value?.editor?.commands?.insertContent?.(text)
});

watch(
  () => internalInputText.value,
  value => {
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

onMounted(() => {
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
  unlistenTauriFileDrop?.();
  void stopTyping();
});
</script>
