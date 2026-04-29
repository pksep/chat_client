<template>
  <div
    class="chat__input"
    :data-testid="`${props.dataTestid}-MessageList-InputContainer`"
  >
    <div
      ref="mentionUsersRef"
      class="chat__input__users"
      v-if="state.tagedUserModal && users.length"
    >
      <template v-for="(user, index) in users" :key="user.id">
        <UserProfile
          class="chat__input__users__item"
          :class="{
            'chat__input__users__item--active': index === state.selectedIndex
          }"
          :user="user"
          @click="selectUser(user)"
          :data-testid="`${props.dataTestid}-MessageList-UserProfile`"
        />
        <div
          v-if="index < users.length - 1"
          class="chat__input__users__divider"
        ></div>
      </template>
    </div>
    <ContentEditor
      :active-send="props.forwardMessages.length > 0"
      v-model="internalInputText"
      ref="contentEditorRef"
      active-attach-file
      active-select-user
      :is-mention-modal-open="state.tagedUserModal"
      :disable-send-on-enter="state.tagedUserModal"
      @unmount-send="handleSend"
      @unmount-attach-file="(...args: any[]) => $emit('attachFile', ...args)"
      @mention-change="handleMentionChange"
      @keydown.capture="handleMentionNav"
      :data-testid="`${props.dataTestid}-MessageList-ContentEditor`"
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
    </ContentEditor>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, reactive, useTemplateRef, watch } from 'vue';
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
import UserProfile from '../UserProfile/UserProfile.vue';
import { useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';

interface Props {
  dataTestid: string;
  modelValue: string;
  editMessage: IMessage | null;
  replyMessage: IMessage | null;
  forwardMessages: IMessage[];
}

const props = defineProps<Props>();

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
const mentionUsersRef = useTemplateRef<HTMLDivElement>('mentionUsersRef');

const state = reactive({
  tagedUsers: [],
  tagedUserModal: false,
  selectedIndex: 0,
  mentionSearch: ''
});

const selectUser = (user: any) => {
  const cleanName = user.initials || 'User';
  contentEditorRef.value?.addSpanLink(`@${cleanName} `, { userId: user.id });
  state.tagedUserModal = false;
};

const handleSend = () => {
  const tiptapEditor = contentEditorRef.value?.editor;
  if (!tiptapEditor) return;

  const usersSet = new Set<string>();

  tiptapEditor.state.doc.descendants(node => {
    if (node.type.name === 'spanNode' && node.attrs.userId) {
      usersSet.add(node.attrs.userId);
    }
  });

  const uniqueUsers = Array.from(usersSet);

  emit('send', uniqueUsers);
};

const handleMentionChange = (search: string | null) => {
  if (search !== null) {
    state.mentionSearch = search;
    if (!state.tagedUserModal) {
      state.selectedIndex = 0;
    }
    state.tagedUserModal = true;
  } else {
    state.tagedUserModal = false;
    state.mentionSearch = '';
  }
};

const handleMentionNav = (e: KeyboardEvent) => {
  if (!state.tagedUserModal || !users.value.length) return;

  const { key } = e;
  const len = users.value.length;

  const prevent = () => {
    e.preventDefault();
    e.stopPropagation();
  };

  if (key === 'ArrowDown' || key === 'ArrowUp') {
    prevent();
    const delta = key === 'ArrowDown' ? 1 : -1;
    state.selectedIndex = (state.selectedIndex + delta + len) % len;
    return;
  }

  if (key === 'Enter') {
    if (state.selectedIndex >= 0 && state.selectedIndex < len) {
      prevent();
      selectUser(users.value[state.selectedIndex]);
    }
    return;
  }

  if (key === 'Escape') {
    prevent();
    state.tagedUserModal = false;
  }
};

const scrollActiveMentionIntoView = () => {
  nextTick(() => {
    const container = mentionUsersRef.value;

    if (!container) {
      return;
    }

    const activeItem = container.querySelector(
      '.chat__input__users__item--active'
    );

    if (!(activeItem instanceof HTMLElement)) {
      return;
    }

    const OFFSET = 50;
    const itemTop = activeItem.offsetTop;
    const itemBottom = itemTop + activeItem.offsetHeight;
    const visibleTop = container.scrollTop;
    const visibleBottom = visibleTop + container.clientHeight;

    if (itemTop - OFFSET < visibleTop) {
      container.scrollTop = Math.max(itemTop - OFFSET, 0);
      return;
    }

    if (itemBottom + OFFSET > visibleBottom) {
      container.scrollTop = itemBottom - container.clientHeight + OFFSET;
    }
  });
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

watch(
  () => state.selectedIndex,
  () => {
    if (!state.tagedUserModal) {
      return;
    }

    scrollActiveMentionIntoView();
  }
);

watch(
  () => users.value.length,
  () => {
    if (!state.tagedUserModal) {
      return;
    }

    scrollActiveMentionIntoView();
  }
);

defineExpose({
  focus: () => contentEditorRef.value?.focus(),
  insertText: (text: string) =>
    contentEditorRef.value?.editor?.commands?.insertContent?.(text)
});
</script>
