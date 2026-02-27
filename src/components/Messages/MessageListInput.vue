<template>
  <div
    class="chat__input"
    :data-testid="`${props.dataTestid}-MessageList-InputContainer`"
  >
    <ContentEditor
      :active-send="!!props.forwardMessage"
      v-model="internalInputText"
      ref="contentEditorRef"
      active-attach-file
      send-on-enter
      @unmount-send="$emit('send')"
      @unmount-attach-file="(...args: any[]) => $emit('attachFile', ...args)"
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
      <template v-else-if="!!props.forwardMessage" #action>
        <div class="chat__input__action">
          <ForwardIcon />
          <div class="chat__input__action__blog">
            <h5>Переслать 1 сообщение</h5>
            <p>
              {{ props.forwardMessage.senderUser?.initials }}:
              {{ stripHtml(props.forwardMessage?.text || 'Вложение') }}
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
import { computed, useTemplateRef } from 'vue';
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

interface Props {
  dataTestid: string;
  modelValue: string;
  editMessage: IMessage | null;
  replyMessage: IMessage | null;
  forwardMessage: IMessage | null;
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

const contentEditorRef =
  useTemplateRef<typeof ContentEditor>('contentEditorRef');

defineExpose({
  focus: () => contentEditorRef.value?.focus()
});
</script>
