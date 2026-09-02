<template>
  <ContextMenu
    class="message-context-menu"
    :visible="props.visible"
    :position="props.position"
    data-testid="AI-MessageContextMenu"
    @unmount-close="emit('close')"
  >
    <template v-if="props.selectionMode && props.selected">
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('forwardSelection')"
      >
        <ForwardIcon /> Переслать
      </Button>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('cancelSelection')"
      >
        <SelectIcon /> Отменить выбор
      </Button>
      <Button
        v-if="props.canDeleteSelection"
        class="red-context-button"
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('deleteSelection')"
      >
        <Icon :name="IconNameEnum.deleteSmall" /> Удалить
      </Button>
    </template>

    <template v-else>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('reply')"
      >
        <ReplyIcon />
        {{ props.selectedText ? 'Ответить на фрагмент' : 'Ответить' }}
      </Button>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('forward')"
      >
        <ForwardIcon /> Переслать
      </Button>
      <Button
        v-if="props.message.role === 'user'"
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('edit')"
      >
        <EditIcon /> Редактировать
      </Button>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="handleCopy"
      >
        <CopyIcon /> Копировать текст
      </Button>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('togglePin')"
      >
        <template v-if="props.message.pinned">
          <UnpinIcon /> Открепить
        </template>
        <template v-else> <PinIcon /> Закрепить </template>
      </Button>
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('select')"
      >
        <SelectIcon /> Выбрать
      </Button>
      <Button
        v-if="props.message.role === 'user'"
        class="red-context-button"
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="runAction('delete')"
      >
        <Icon :name="IconNameEnum.deleteSmall" /> Удалить
      </Button>
    </template>
  </ContextMenu>
</template>

<script setup lang="ts">
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import type { AiAssistantMessage } from '../../composables/useAiAssistant';
import ContextMenu from '../ContactList/ContextMenu.vue';
import CopyIcon from '../UI/CopyIcon.vue';
import EditIcon from '../UI/EditIcon.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import ReplyIcon from '../UI/ReplyIcon.vue';
import SelectIcon from '../UI/SelectIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';

type MenuAction =
  | 'reply'
  | 'forward'
  | 'edit'
  | 'togglePin'
  | 'select'
  | 'delete'
  | 'forwardSelection'
  | 'cancelSelection'
  | 'deleteSelection';

const props = defineProps<{
  visible: boolean;
  position: { x: number; y: number };
  message: AiAssistantMessage;
  selectedText?: string;
  selectionMode?: boolean;
  selected?: boolean;
  canDeleteSelection?: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'action', action: MenuAction): void;
}>();

const runAction = (action: MenuAction): void => {
  emit('action', action);
  emit('close');
};

const handleCopy = async (): Promise<void> => {
  const text = props.selectedText?.trim() || props.message.text;
  if (text) await navigator.clipboard.writeText(text);
  emit('close');
};
</script>
