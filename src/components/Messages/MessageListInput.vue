<template>
  <div
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
              <p>
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
              <h5>В ответ {{ props.replyMessage.senderUser?.initials }}</h5>
              <p>
                {{ stripHtml(props.replyMessage?.text || 'Вложение') }}
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
              <p>
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
              <p v-if="props.customActionDescription">
                {{ props.customActionDescription }}
              </p>
            </div>
          </div>
        </template>
      </ContentEditor>
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  useTemplateRef,
  watch
} from 'vue';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
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
import { getNotoEmojiAssetCandidates } from '../../composables/useEmojiStyle';
import {
  getHasWebsocketConnection,
  sendTypingStatus
} from '../../services/useChat';

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
const EMOJI_INPUT_PLUGIN_KEY = new PluginKey('chatInputEmojiDecorations');
const emojiInputPluginEditors = new WeakSet<Editor>();
const emojiInputPluginFrames = new WeakMap<Editor, number>();
const emojiSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
const EMOJI_GRAPHEME_PATTERN =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]|[#*0-9]\uFE0F?\u20E3|[\u00A9\u00AE\u2122]\uFE0F?)/u;

const splitGraphemes = (value: string): string[] => {
  if (!value) {
    return [];
  }

  if (!emojiSegmenter) {
    return Array.from(value);
  }

  return Array.from(emojiSegmenter.segment(value), item => item.segment);
};

const containsEmoji = (value: string): boolean =>
  EMOJI_GRAPHEME_PATTERN.test(value);

const createEmojiInputWidget = (emoji: string): HTMLElement => {
  const wrapper = document.createElement('span');
  const image = document.createElement('img');
  const candidates = getNotoEmojiAssetCandidates(emoji);

  wrapper.className = 'emoji-input-glyph';
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.setAttribute('contenteditable', 'false');

  image.className = 'emoji-input-glyph__image';
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;

  if (candidates[0]) {
    image.src = candidates[0];
  }

  image.addEventListener('error', () => {
    wrapper.classList.add('emoji-input-glyph--fallback');
    wrapper.textContent = emoji;
  });

  wrapper.append(image);

  return wrapper;
};

const buildEmojiInputDecorations = (
  doc: Editor['state']['doc']
): DecorationSet => {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text || !containsEmoji(node.text)) {
      return;
    }

    const segments = splitGraphemes(node.text);
    let offset = 0;

    segments.forEach(segment => {
      const from = pos + offset;
      const to = from + segment.length;

      offset += segment.length;

      if (!containsEmoji(segment)) {
        return;
      }

      decorations.push(
        Decoration.inline(from, to, {
          class: 'emoji-input-hidden'
        })
      );
      decorations.push(
        Decoration.widget(from, () => createEmojiInputWidget(segment), {
          side: -1
        })
      );
    });
  });

  return DecorationSet.create(doc, decorations);
};

const createEmojiInputPlugin = (): Plugin =>
  new Plugin({
    key: EMOJI_INPUT_PLUGIN_KEY,
    state: {
      init: (_config, state) => buildEmojiInputDecorations(state.doc),
      apply: (transaction, value, _oldState, newState) =>
        transaction.docChanged
          ? buildEmojiInputDecorations(newState.doc)
          : value
    },
    props: {
      decorations(state) {
        return EMOJI_INPUT_PLUGIN_KEY.getState(state);
      }
    }
  });

const clearScheduledEmojiInputPlugin = (editor: Editor): void => {
  const frameId = emojiInputPluginFrames.get(editor);

  if (frameId !== undefined) {
    window.cancelAnimationFrame(frameId);
    emojiInputPluginFrames.delete(editor);
  }
};

const scheduleEmojiInputPlugin = (
  editor: Editor,
  attempt = 0,
  maxAttempts = 5
): void => {
  if (
    emojiInputPluginEditors.has(editor) ||
    emojiInputPluginFrames.has(editor)
  ) {
    return;
  }

  const frameId = window.requestAnimationFrame(() => {
    emojiInputPluginFrames.delete(editor);

    if (editor.isDestroyed || !editor.view?.dom?.isConnected) {
      if (attempt < maxAttempts) {
        scheduleEmojiInputPlugin(editor, attempt + 1, maxAttempts);
      }

      return;
    }

    try {
      editor.registerPlugin(createEmojiInputPlugin());
      emojiInputPluginEditors.add(editor);
    } catch (error) {
      if (attempt < maxAttempts) {
        scheduleEmojiInputPlugin(editor, attempt + 1, maxAttempts);
        return;
      }

      console.warn('Failed to register emoji input plugin', error);
    }
  });

  emojiInputPluginFrames.set(editor, frameId);
};

const ensureEmojiInputPlugin = (editor?: Editor | null): void => {
  if (
    !editor ||
    editor.isDestroyed ||
    !editor.view ||
    emojiInputPluginEditors.has(editor)
  ) {
    return;
  }

  void nextTick(() => {
    if (!editor.isDestroyed) {
      scheduleEmojiInputPlugin(editor);
    }
  });
};

let typingStopTimeout: ReturnType<typeof setTimeout> | null = null;
let isTypingActive = false;
let activeTypingTopicId: string | null = null;
let lastTypingPingAt = 0;

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

watch(
  () => contentEditorRef.value?.editor,
  editor => {
    if (!editor) {
      return;
    }

    ensureEmojiInputPlugin(editor);
  },
  {
    immediate: true
  }
);

onBeforeUnmount(() => {
  const editor = contentEditorRef.value?.editor;

  if (editor) {
    clearScheduledEmojiInputPlugin(editor);

    if (!editor.isDestroyed && emojiInputPluginEditors.has(editor)) {
      editor.unregisterPlugin(EMOJI_INPUT_PLUGIN_KEY);
      emojiInputPluginEditors.delete(editor);
    }
  }

  void stopTyping();
});
</script>

<style scoped>
.chat__input :deep(.emoji-input-hidden) {
  font-size: 0 !important;
  line-height: 0 !important;
  color: transparent !important;
}

.chat__input :deep(.emoji-input-glyph) {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.12em;
  pointer-events: none;
}

.chat__input :deep(.emoji-input-glyph__image) {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.chat__input :deep(.emoji-input-glyph--fallback) {
  width: auto;
  height: auto;
  vertical-align: baseline;
}
</style>
