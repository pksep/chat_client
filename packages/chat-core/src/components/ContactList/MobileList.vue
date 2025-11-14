<template>
  <div
    class="mobile-list-container"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
  >
    <section v-if="props.chapter === 'assistant'">
      <button
        class="menu__user-assistant"
        @click="handleChapter('ai')"
        :data-testid="`${props.dataTestid}-AIAssistant-Button`"
      >
        <AiIconWrapper :data-testid="`${props.dataTestid}-AIAssistant-Icon`" />
        <h3
          class="menu__user-assistant-title"
          :data-testid="`${props.dataTestid}-AIAssistant-Title`"
        >
          AI Ассистент
        </h3>
      </button>
      <Line
        class="menu__user-line"
        :data-testid="`${props.dataTestid}-AIAssistant-Line`"
      />
    </section>

    <section
      v-else
      class="chat-list"
      role="region"
      aria-label="Contact list"
      :data-testid="`${props.dataTestid}-ChatList-Section`"
    >
      <ContactList
        :contacts="props.contacts"
        :data-testid="`${props.dataTestid}-ContactList`"
        @unmount-click="handleChapter"
      />
    </section>
  </div>
  <Button :type="ButtonTypeEnum.secondary">
    <Icon :name="IconNameEnum.plus" />
  </Button>
</template>

<script setup lang="ts">
import AiIconWrapper from '../AiIconWrapper.vue';
import Line from '../Line.vue';
import ContactList from './ContactList.vue';
import type { IMobileListProps } from './interfaces/mobile-list';
import type { IMenuEmits } from '../interfaces/interfaces';
import { Button, ButtonTypeEnum, Icon, IconNameEnum } from 'sep-yui';

const props = withDefaults(defineProps<IMobileListProps>(), {
  contacts: () => [],
  dataTestid: () => 'MobileList'
});

const emits = defineEmits<IMenuEmits>();

const handleChapter = (
  chapter: { name: string; contact: any } | string | null
): void => {
  if (typeof chapter === 'string') {
    emits('unmount-chapter', chapter);
  } else if (chapter && chapter.name) {
    console.log(chapter);
    emits('unmount-chapter', chapter);
  } else {
    emits('unmount-chapter', null);
  }
};
</script>
