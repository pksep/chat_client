<template>
  <div class="client-details" data-testid="ClientDetails">
    <div class="client-details__field">
      <label>Менеджер</label>
      <div :class="{ 'client-details__saving': saving }" :aria-busy="saving">
        <UserMultiSelect
          :model-value="selectedManagers"
          :options="options"
          default-option="Не выбран"
          data-testid="Client-Managers"
          @update:model-value="selectManagers"
        />
      </div>
    </div>
    <div class="client-details__field">
      <label>Примечание</label>
      <Textarea
        v-model="note"
        :type="TextareaTypeEnum.minor"
        placeholder="Введите примечание"
        :maxlength="10000"
        :readonly="saving"
        data-testid="Client-Note"
        @focusout="save"
      />
    </div>
    <template v-if="conflict">
      <Button
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.small"
        :disabled="saving"
        @click="save(true)"
        >Сохранить мои изменения</Button
      >
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click="resetDraft"
        >Принять сохранённые</Button
      >
    </template>
    <div v-if="candidates.length" class="client-details__candidates">
      <p>Найдены контакты в СЭП. Выберите, с каким связать клиента:</p>
      <Button
        v-for="candidate in candidates"
        :key="candidate.id"
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.small"
        :disabled="erpBusy || candidate.ban"
        @click="handleErp(candidate.id)"
        >{{ candidate.initial }} · №{{ candidate.id
        }}{{ candidate.ban ? ' · В архиве' : '' }}</Button
      >
    </div>
    <Button
      v-if="failedOperation"
      :type="ButtonTypeEnum.secondary"
      :size="SizesEnum.small"
      :disabled="erpBusy"
      @click="retryErp"
      >Повторить синхронизацию</Button
    >
  </div>
</template>
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  SizesEnum,
  Textarea,
  TextareaTypeEnum,
  UserMultiSelect
} from '@pksep/yui';
import {
  loadInquiry,
  managerRequest,
  ManagerRequestError,
  saveInquiryMetadata,
  useManagerInquiries,
  type ManagerInquiry
} from '../../composables/useManagerInquiries';
import { getConfig } from '../../services/useConfig';
import { openErpContact } from '../../composables/useErpContact';
import { showErrorNotification } from '../../composables/useNotifications';

const props = defineProps<{ inquiry: ManagerInquiry }>();
const { managers } = useManagerInquiries();
const note = ref('');
const selectedManagers = ref<string[]>([]);
const version = ref(0);
const saving = ref(false);
const conflict = ref(false);
const erpBusy = ref(false);
const failedOperation = ref('');
const candidates = ref<Array<{ id: number; initial: string; ban: boolean }>>(
  []
);
let poll: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const options = computed(() => {
  const people = managers.value.map(person => ({
    key: person.id,
    value: person.initials || person.nickname || person.id,
    fullName: `${person.initials || ''} ${person.nickname || ''}`,
    hint: person.nickname || '',
    serviceNumber: '',
    image: person.avatarUrl
      ? /^(https?:|data:|blob:)/.test(person.avatarUrl)
        ? person.avatarUrl
        : `${getConfig().CHAT_PATH_TO_FILE_CDN?.replace(/\/+$/, '')}/${person.avatarUrl}`
      : null
  }));
  for (const id of selectedManagers.value)
    if (!people.some(person => person.key === id))
      people.push({
        key: id,
        value: 'Менеджер без доступа',
        fullName: id,
        hint: id,
        serviceNumber: '',
        image: null
      });
  return people;
});
const dirty = computed(
  () =>
    note.value !== props.inquiry.note ||
    JSON.stringify(selectedManagers.value) !==
      JSON.stringify(props.inquiry.manager_ids)
);
function resetDraft(): void {
  note.value = props.inquiry.note;
  selectedManagers.value = [...props.inquiry.manager_ids];
  version.value = props.inquiry.metadata_version;
  conflict.value = false;
}
watch(
  () => props.inquiry.id,
  () => {
    resetDraft();
    candidates.value = [];
    failedOperation.value = '';
    clearTimeout(poll);
    void checkErp();
  },
  { immediate: true }
);
watch(
  () => props.inquiry.metadata_version,
  (_value, previous) => {
    if (saving.value) return;
    // Do not replace an unsaved draft with another manager's changes.
    if (
      version.value === previous &&
      !conflict.value &&
      note.value === previousNote &&
      JSON.stringify(selectedManagers.value) === previousManagers
    )
      resetDraft();
    previousNote = props.inquiry.note;
    previousManagers = JSON.stringify(props.inquiry.manager_ids);
  }
);
let previousNote = props.inquiry.note;
let previousManagers = JSON.stringify(props.inquiry.manager_ids);
async function selectManagers(ids: string[]): Promise<void> {
  if (saving.value) return;
  selectedManagers.value = ids;
  await save();
}
async function save(overwrite: unknown = false): Promise<void> {
  if (saving.value || !dirty.value || (conflict.value && overwrite !== true))
    return;
  const item = props.inquiry;
  saving.value = true;
  try {
    const patch = {
      ...(JSON.stringify(selectedManagers.value) !==
      JSON.stringify(item.manager_ids)
        ? { managerIds: [...selectedManagers.value] }
        : {}),
      ...(note.value !== item.note ? { note: note.value } : {})
    };
    const result = await saveInquiryMetadata(
      item,
      patch,
      overwrite === true ? item.metadata_version : version.value
    );
    version.value = result.version;
    previousNote = note.value;
    previousManagers = JSON.stringify(selectedManagers.value);
    conflict.value = false;
  } catch (cause) {
    if (cause instanceof ManagerRequestError && cause.status === 409) {
      conflict.value = true;
      await loadInquiry(item.id).catch(() => {});
      showErrorNotification(
        'Карточку изменил другой менеджер. Вы можете принять сохранённые данные или сохранить свои изменения.'
      );
      return;
    }

    showErrorNotification(
      cause instanceof Error ? cause.message : 'Не удалось сохранить'
    );
  } finally {
    saving.value = false;
  }
}
async function checkErp(): Promise<void> {
  const id = props.inquiry.id;
  try {
    const detail = await loadInquiry(id);
    if (disposed || id !== props.inquiry.id) return;
    const active = detail.erpOperations.find(operation =>
      ['pending', 'working'].includes(operation.state)
    );
    erpBusy.value = !!active;
    const failed =
      !detail.inquiry.erp_contact_id &&
      detail.erpOperations.find(operation =>
        ['failed', 'conflict'].includes(operation.state)
      );
    failedOperation.value =
      failed && failed.state === 'failed' ? failed.id : '';
    if (failed)
      showErrorNotification(
        failed.state === 'conflict'
          ? 'В СЭП найдены совпадения. Нажмите «Создать в СЭП» и выберите контакт.'
          : 'Синхронизация не завершена. Можно повторить попытку.'
      );
    if (detail.inquiry.erp_contact_id) {
      candidates.value = [];
      failedOperation.value = '';
    }
    if (active) poll = setTimeout(() => void checkErp(), 3000);
  } catch (cause) {
    if (!disposed) {
      erpBusy.value = false;
      showErrorNotification(
        cause instanceof Error
          ? cause.message
          : 'Не удалось проверить синхронизацию'
      );
    }
  }
}
/** Передаёт контакт штатной форме ЕРП без автоматического создания. */
async function handleErp(contactId?: unknown): Promise<void> {
  if (erpBusy.value && !props.inquiry.erp_contact_id) return;
  erpBusy.value = true;
  try {
    candidates.value = await openErpContact(
      props.inquiry,
      typeof contactId === 'number' ? contactId : undefined
    );
  } catch (cause) {
    showErrorNotification(
      cause instanceof ManagerRequestError && cause.status === 403
        ? 'Нет доступа к синхронизации СЭП или не настроена связь сотрудника с ЕРП.'
        : cause instanceof Error
          ? cause.message
          : 'Не удалось найти контакты'
    );
  } finally {
    erpBusy.value = false;
  }
}
async function retryErp(): Promise<void> {
  erpBusy.value = true;
  try {
    await managerRequest(`inquiries/${props.inquiry.id}/erp/retry`, {
      operationId: failedOperation.value
    });
    await checkErp();
  } catch (cause) {
    erpBusy.value = false;
    showErrorNotification(
      cause instanceof Error
        ? cause.message
        : 'Не удалось повторить синхронизацию'
    );
  }
}
onUnmounted(() => {
  disposed = true;
  clearTimeout(poll);
});
defineExpose({ handleErp, erpBusy });
</script>
<style scoped>
.client-details {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  margin-top: 15px;
}
.client-details__field {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.client-details__field > label {
  font-size: 14px;
  line-height: 20px;
  color: var(--text-primary);
}
.client-details__saving {
  pointer-events: none;
  opacity: 0.6;
}
.client-details__candidates p {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--text-secondary);
}
.client-details__candidates {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
