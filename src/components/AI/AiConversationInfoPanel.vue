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
    <div class="ai-info__body">
      <div class="ai-info__avatar"><AiAvatar /></div>
      <p class="ai-info__subtitle">СЭПи · ИИ-ассистент</p>
      <p v-if="loading" role="status">Загрузка...</p>
      <p
        v-else-if="error"
        role="alert"
        :data-testid="`${props.dataTestid}-Error`"
      >
        {{ error }}
      </p>
      <p v-else-if="!info">Информация появится после первого сообщения.</p>
      <template v-if="info">
        <form class="ai-info__name" @submit.prevent="saveTitle">
          <label :for="`${props.dataTestid}-NameInput`">Название чата</label>
          <Input
            :id="`${props.dataTestid}-NameInput`"
            class="minor"
            :model-value="title"
            :maxlength="160"
            :disabled="busy"
            :data-testid="`${props.dataTestid}-Name`"
            @update:model-value="setTitle"
          />
          <Button
            v-if="title.trim() !== savedTitle"
            :disabled="busy || !title.trim()"
            :size="SizesEnum.small"
            :data-testid="`${props.dataTestid}-SaveName`"
            @click="saveTitle"
            >Сохранить</Button
          >
        </form>
        <div class="menu-info__buttons ai-info__actions">
          <Button
            :type="ButtonTypeEnum.secondary"
            :size="SizesEnum.large"
            class="menu-info__secondary-button ai-info__action"
            :disabled="busy"
            :aria-pressed="info.muted"
            :data-testid="`${props.dataTestid}-Mute`"
            @click="toggleMute"
          >
            <component :is="info.muted ? MuteIcon : UnmuteIcon" /><span>{{
              info.muted ? 'Звук выкл.' : 'Звук вкл.'
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
        <ProfileAttachmentsPanel
          v-if="attachments"
          :source="attachments"
          :data-testid="`${props.dataTestid}-Attachments`"
        />
      </template>
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
import CallIcon from '../CallModal/UI/CallIcon.vue';
import MessageIcon from '../UI/MessageIcon.vue';
import MuteIcon from '../UI/MuteIcon.vue';
import UnmuteIcon from '../UI/UnmuteIcon.vue';
import { useAiConversationInfo } from '../../composables/useAiConversationInfo';
import { useAiAssistant } from '../../composables/useAiAssistant';
import { navigateToAI } from '../../composables/navigation';
import { getAuthUser } from '../../composables/useAuth';
import {
  fetchAiConversationInfo,
  updateAiConversationInfo,
  type AiConversationInfo
} from '../../services/aiConversationInfo';
import { createAiAttachmentSource } from '../../services/aiConversationAttachments';

const props = withDefaults(
  defineProps<{ mobile?: boolean; dataTestid?: string }>(),
  { dataTestid: 'AiConversationInfo' }
);
const { source, close } = useAiConversationInfo();
const assistant = useAiAssistant();
const info = shallowRef<AiConversationInfo | null>(null);
const title = ref('');
const error = ref('');
const loading = ref(false);
const busy = ref(false);
let revision = 0;
const savedTitle = computed(
  () =>
    info.value?.title ||
    assistant.sessions.value.find(
      session => session.id === info.value?.threadId
    )?.title ||
    'СЭПи'
);
const attachments = computed(() =>
  info.value
    ? createAiAttachmentSource(info.value, (messageId): void => {
        if (!info.value) return;
        assistant.requestMessageNavigation(info.value.threadId, messageId);
        openChat();
      })
    : undefined
);

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
    info.value = null;
    error.value = '';
    loading.value = Boolean(current.threadId);
    busy.value = false;
    if (!current.threadId) return;
    try {
      const result = await fetchAiConversationInfo(
        current.threadId,
        current.expected
      );
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
  if (title.value.trim()) await save({ title: title.value.trim() });
}

async function toggleMute(): Promise<void> {
  if (info.value) await save({ muted: !info.value.muted });
}

function openChat(): void {
  if (!info.value) return;
  assistant.selectSession(info.value.threadId);
  navigateToAI(info.value.threadId);
  close();
}

function call(): void {
  if (!info.value) return;
  openChat();
  assistant.startVoiceCall();
}

onBeforeUnmount((): void => {
  revision++;
});
</script>

<style scoped lang="scss">
.ai-info {
  width: 100%;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  color: var(--text-color);
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    border-bottom: 1px solid var(--border-color, #8884);
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
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
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
