<template>
  <section class="ai-info" :data-testid="props.dataTestid">
    <header v-if="!props.mobile" class="ai-info__header">
      <h4>Информация о чате</h4>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        aria-label="Закрыть информацию о чате"
        @click="close"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>
    <div class="ai-info__body" :aria-busy="loading">
      <div class="ai-info__avatar"><AiAvatar /></div>
      <p class="ai-info__subtitle">СЭПи</p>
      <div
        v-if="loading"
        class="ai-info__skeleton"
        :data-testid="`${props.dataTestid}-Skeleton`"
        aria-hidden="true"
      >
        <SkeletonBlock class="ai-info__skeleton-name" />
        <div class="ai-info__actions">
          <SkeletonBlock
            v-for="index in 3"
            :key="index"
            class="ai-info__skeleton-action"
          />
        </div>
      </div>
      <p
        v-else-if="error"
        role="alert"
        :data-testid="`${props.dataTestid}-Error`"
      >
        {{ error }}
      </p>
      <template v-if="threadId">
        <form class="ai-info__name" @submit.prevent="saveTitle">
          <Input
            :input-id="`${props.dataTestid}-NameInput`"
            aria-label="Название чата"
            class="initial ai-info__title-input"
            :model-value="title"
            :maxlength="160"
            :disabled="busy"
            :data-testid="`${props.dataTestid}-Name`"
            @update:model-value="setTitle"
          />
          <Button
            v-if="canSaveTitle"
            class="menu__info-save-button"
            :type="ButtonTypeEnum.primary"
            :size="SizesEnum.little"
            :disabled="busy"
            :data-testid="`${props.dataTestid}-SaveName`"
            @click.prevent="saveTitle"
            >Сохранить</Button
          >
        </form>
        <div class="menu-info__buttons ai-info__actions">
          <Button
            :type="ButtonTypeEnum.secondary"
            :size="SizesEnum.large"
            class="menu-info__secondary-button ai-info__action"
            :disabled="busy"
            :aria-pressed="muted"
            :data-testid="`${props.dataTestid}-Mute`"
            @click="toggleMute"
          >
            <component :is="muted ? MuteIcon : UnmuteIcon" /><span>{{
              muted ? 'Звук выкл.' : 'Звук вкл.'
            }}</span>
          </Button>
          <Button
            :type="ButtonTypeEnum.secondary"
            :size="SizesEnum.large"
            class="menu-info__secondary-button ai-info__action"
            :data-testid="`${props.dataTestid}-Call`"
            @click="call"
            ><CallIcon /><span>Звонок</span></Button
          >
          <Button
            :type="ButtonTypeEnum.secondary"
            :size="SizesEnum.large"
            class="menu-info__secondary-button ai-info__action"
            :data-testid="`${props.dataTestid}-OpenChat`"
            @click="openChat"
            ><MessageIcon /><span>Перейти в чат</span></Button
          >
        </div>
      </template>
      <ProfileAttachmentsPanel
        v-if="!loading && (threadId || !error)"
        :key="threadId"
        :source="attachments"
        :data-testid="`${props.dataTestid}-Attachments`"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  Input,
  SizesEnum
} from '@pksep/yui';
import AiAvatar from './AiAvatar.vue';
import ProfileAttachmentsPanel from '../ProfileAttachmentsPanel.vue';
import SkeletonBlock from '../UI/SkeletonBlock.vue';
import CallIcon from '../CallModal/UI/CallIcon.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import MuteIcon from '../UI/MuteIcon.vue';
import UnmuteIcon from '../UI/UnmuteIcon.vue';
import { useAiConversationInfo } from '../../composables/useAiConversationInfo';
import { useAiAssistant } from '../../composables/useAiAssistant';
import {
  loadDesktopAgentChat,
  type DesktopAgentChat
} from '../../composables/useDesktopAgentChats';
import { navigateToAI } from '../../composables/navigation';
import { getAuthUser } from '../../composables/useAuth';
import {
  updateAiConversationInfo,
  type AiConversationInfo
} from '../../services/aiConversationInfo';
import {
  createAgentAttachmentSource,
  createAiAttachmentSource
} from '../../services/aiConversationAttachments';

const props = withDefaults(
  defineProps<{ mobile?: boolean; dataTestid?: string }>(),
  { dataTestid: 'AiConversationInfo' }
);
const { source, close } = useAiConversationInfo();
const assistant = useAiAssistant();
const info = shallowRef<AiConversationInfo | null>(null);
const agentHistory = shallowRef<DesktopAgentChat | null>(null);
const fileUrls = new Map<File, string>();

function localFileUrl(file: File): string {
  const existing = fileUrls.get(file);
  if (existing) return existing;

  const url = URL.createObjectURL(file);
  fileUrls.set(file, url);
  return url;
}

function releaseFileUrls(): void {
  for (const url of fileUrls.values()) URL.revokeObjectURL(url);
  fileUrls.clear();
}
const title = ref('');
const error = ref('');
const loading = ref(false);
const busy = ref(false);
let revision = 0;
const localSession = computed(() =>
  source.value.localThreadId
    ? assistant.sessions.value.find(
        session =>
          session.kind === 'agent' && session.id === source.value.localThreadId
      )
    : undefined
);
const threadId = computed(() => localSession.value?.id ?? info.value?.threadId);
const muted = computed(
  () => localSession.value?.muted ?? info.value?.muted ?? false
);
const savedTitle = computed(
  () =>
    localSession.value?.title ||
    info.value?.title ||
    assistant.sessions.value.find(
      session => session.id === info.value?.threadId
    )?.title ||
    'СЭПи'
);
const canSaveTitle = computed<boolean>(() => {
  const name = title.value.trim();

  return name.length > 0 && name !== savedTitle.value;
});

const attachments = computed<
  ReturnType<typeof createAiAttachmentSource> | undefined
>(previous => {
  const local = localSession.value;
  if (local?.agentOwnerId && agentHistory.value?.id === local.id) {
    return createAgentAttachmentSource(
      local.id,
      local.agentOwnerId,
      agentHistory.value.messages,
      localFileUrl,
      messageId => {
        assistant.requestMessageNavigation(local.id, messageId);
        openChat();
      }
    );
  }
  const current = info.value;
  if (!current) return;

  const next = createAiAttachmentSource(current, (messageId): void => {
    assistant.requestMessageNavigation(current.threadId, messageId);
    openChat();
  });

  return previous?.key === next.key ? previous : next;
});

watch(
  () => getAuthUser()?.id,
  (): void => {
    info.value = null;
    revision++;
    close();
  }
);

const setTitle = (value: string | number): void => {
  title.value = String(value).slice(0, 160);
};

watch(
  source,
  async (current): Promise<void> => {
    const request = ++revision;
    agentHistory.value = null;
    releaseFileUrls();
    info.value = null;
    error.value = '';
    loading.value = Boolean(current.request);
    busy.value = false;
    try {
      if (current.localThreadId) {
        const local = localSession.value;
        if (!local?.agentOwnerId) {
          throw new Error('Локальный чат доступен только владельцу.');
        }
        title.value = savedTitle.value;
        loading.value = true;
        const history = await loadDesktopAgentChat(
          local.id,
          local.agentOwnerId,
          local.project ?? null
        );
        if (request === revision) agentHistory.value = history;
        return;
      }
      if (!current.request) return;
      const result = await current.request;
      if (request !== revision) return;
      info.value = result;
      assistant.applyConversationInfo(result);
      title.value = savedTitle.value;
    } catch (reason) {
      if (request === revision)
        error.value =
          reason instanceof Error
            ? reason.message
            : 'Не удалось загрузить информацию.';
    } finally {
      if (request === revision) loading.value = false;
    }
  },
  { immediate: true }
);

async function save(patch: { title?: string; muted?: boolean }): Promise<void> {
  if (localSession.value) {
    assistant.updateAgentConversation(localSession.value.id, patch);
    title.value = savedTitle.value;
    return;
  }
  const current = info.value;
  if (!current || busy.value) return;
  const request = revision;
  busy.value = true;
  error.value = '';
  try {
    const result = await updateAiConversationInfo(current.threadId, {
      generation: current.generation,
      ...patch
    });
    if (request !== revision) return;
    info.value = result;
    assistant.applyConversationInfo(result);
    title.value = savedTitle.value;
  } catch (reason) {
    if (request === revision)
      error.value =
        reason instanceof Error ? reason.message : 'Изменения не сохранены.';
  } finally {
    if (request === revision) busy.value = false;
  }
}

async function saveTitle(): Promise<void> {
  if (!canSaveTitle.value || busy.value) return;

  await save({ title: title.value.trim() });
}

async function toggleMute(): Promise<void> {
  if (threadId.value) await save({ muted: !muted.value });
}

function openChat(): void {
  if (!threadId.value) return;
  assistant.selectSession(threadId.value);
  navigateToAI(threadId.value);
  close();
}

function call(): void {
  if (!threadId.value) return;
  openChat();
  assistant.startVoiceCall();
}

onBeforeUnmount((): void => {
  revision++;
  releaseFileUrls();
});
</script>

<style scoped lang="scss">
.ai-info {
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  color: var(--text-primary);
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-table);
  }
  &__header h4 {
    flex: 1;
    text-align: center;
    margin: 0;
  }
  &__body {
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  &__avatar {
    width: 96px;
    height: 96px;
    align-self: center;
  }
  &__avatar :deep(.ai-avatar) {
    width: 100%;
    height: 100%;
  }
  &__subtitle {
    text-align: center;
    margin: 0;
  }
  &__name {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    min-width: 0;
  }
  :deep(fieldset.input-yui-kit.initial.ai-info__title-input) {
    min-height: 36px;
    background-color: var(--table-surface-search, #f8f9fd);
  }
  &__skeleton {
    display: grid;
    gap: 8px;
  }
  &__skeleton-name,
  &__skeleton-action {
    border-radius: 6px;
  }
  &__skeleton-name {
    height: 36px;
    margin-bottom: 8px;
  }
  &__skeleton-action {
    height: 68px;
  }
  &__actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  &__action {
    min-width: 0;
    flex-direction: column;
    gap: 8px;
    padding: 12px 4px;
    height: auto;
    white-space: normal;
  }
  &__action svg {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
  }
}
</style>
