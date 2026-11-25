<template>
  <section class="agent-work" aria-label="Ход работы агента">
    <button
      v-if="rows.length"
      type="button"
      class="agent-work__toggle"
      :aria-expanded="expanded"
      @click.stop="expanded = !expanded"
    >
      {{ heading }}<span aria-hidden="true" class="agent-work__chevron" />
    </button>
    <span v-else class="agent-work__time">{{ heading }}</span>
    <ol
      v-if="expanded && rows.length"
      class="agent-work__entries"
      aria-label="Этапы работы"
    >
      <li v-for="row in rows" :key="row.entry.id">
        <div
          v-if="row.entry.kind === 'action'"
          class="agent-work__action"
          :class="{ 'agent-work__action--error': row.entry.state === 'failed' }"
        >
          <span class="agent-work__terminal" aria-hidden="true">›_</span>
          <span
            >{{ row.entry.text
            }}<template v-if="row.count > 1"> ×{{ row.count }}</template></span
          >
        </div>
        <template v-else>
          <button
            v-if="row.earlier.length"
            type="button"
            class="agent-work__more"
            :aria-expanded="showEarlier"
            @click.stop="showEarlier = !showEarlier"
          >
            {{
              showEarlier
                ? 'Скрыть предыдущие пояснения'
                : 'Предыдущие пояснения'
            }}
            ({{ row.earlier.length }})
          </button>
          <template v-if="showEarlier">
            <AiAnswerMarkdown
              v-for="note in row.earlier"
              :key="note.id"
              class="agent-work__paragraph"
              :content="translations.get(note.text) ?? ''"
            />
          </template>
          <AiAnswerMarkdown
            class="agent-work__paragraph"
            :content="translations.get(row.entry.text) ?? ''"
          />
        </template>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { AgentWorkEntry } from '../../types/agent-work';
import { useRussianAgentNotes } from '../../composables/useRussianAgentNotes';
import AiAnswerMarkdown from './AiAnswerMarkdown.vue';

const props = defineProps<{
  entries?: AgentWorkEntry[];
  summaries?: string[];
  threadId?: string | null;
  duration: string;
  live?: boolean;
}>();

const expanded = ref(Boolean(props.live));
const showEarlier = ref(false);
const heading = computed<string>(() => {
  if (props.live) return `Работаю ${props.duration}`.trim();
  return props.duration ? `Работа заняла ${props.duration}` : 'Ход работы';
});

interface Row {
  entry: AgentWorkEntry;
  earlier: AgentWorkEntry[];
  count: number;
}

const rows = computed<Row[]>(() => {
  const entries: AgentWorkEntry[] = props.entries?.length
    ? props.entries
    : (props.summaries ?? []).map((text, index) => ({
        kind: 'summary',
        id: String(index),
        text
      }));
  const result: Row[] = [];
  const summariesOnly = entries.every(entry => entry.kind === 'summary');
  let pending: AgentWorkEntry[] = [];

  function flushSummaries(next?: AgentWorkEntry): void {
    const latest = pending.at(-1);
    // Пояснение агента пользователю уже описывает этот этап.
    if (latest && next?.kind !== 'commentary') {
      result.push({
        entry: latest,
        earlier: summariesOnly ? pending.slice(0, -1) : [],
        count: 1
      });
    }
    pending = [];
  }

  for (const entry of entries) {
    if (entry.kind === 'summary') {
      pending.push(entry);
      continue;
    }
    flushSummaries(entry);
    const last = result.at(-1);
    if (
      entry.kind === 'action' &&
      entry.state === 'done' &&
      last?.entry.kind === 'action' &&
      last.entry.state === 'done' &&
      last.entry.text === entry.text
    ) {
      last.count++;
    } else {
      result.push({ entry, earlier: [], count: 1 });
    }
  }
  flushSummaries();
  return result;
});

const visibleNotes = computed<string[]>(() =>
  expanded.value
    ? rows.value.flatMap(row => {
        if (row.entry.kind === 'action') return [];
        return showEarlier.value
          ? [...row.earlier.map(entry => entry.text), row.entry.text]
          : [row.entry.text];
      })
    : []
);
const localized = useRussianAgentNotes(
  () => props.threadId,
  () => visibleNotes.value
);
const translations = computed(
  () =>
    new Map(
      visibleNotes.value.map((text, index) => [text, localized.value[index]])
    )
);
</script>

<style scoped>
.agent-work {
  flex-basis: 100%;
  min-width: 0;
  color: var(--text-primary);
  user-select: text;
}
.agent-work__toggle,
.agent-work__more,
.agent-work__time {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  padding: 2px 0;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  font-variant-numeric: tabular-nums;
}
.agent-work button {
  cursor: pointer;
}
.agent-work button:hover,
.agent-work button:focus-visible {
  color: var(--text-primary);
}
.agent-work__chevron {
  width: 6px;
  height: 6px;
  border: solid currentColor;
  border-width: 0 1px 1px 0;
  transform: rotate(-45deg);
}
[aria-expanded='true'] > .agent-work__chevron {
  transform: translateY(-2px) rotate(45deg);
}
.agent-work__entries {
  display: grid;
  gap: 14px;
  margin: 8px 0 12px;
  padding: 0;
  list-style: none;
}
.agent-work .agent-work__paragraph {
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.agent-work__paragraph + .agent-work__paragraph {
  margin-top: 10px;
}
.agent-work__paragraph :deep(:is(strong, h1, h2, h3, h4, h5, h6)) {
  font: inherit;
}
.agent-work__action {
  display: flex;
  align-items: baseline;
  gap: 9px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 19px;
  overflow-wrap: anywhere;
}
.agent-work__action--error {
  color: var(--text-error, var(--text-secondary));
}
.agent-work__terminal {
  display: inline-grid;
  place-items: center;
  flex: none;
  align-self: flex-start;
  margin-top: 3px;
  width: 14px;
  height: 12px;
  box-sizing: border-box;
  border: 1px solid currentColor;
  border-radius: 3px;
  font: 9px/1 monospace;
}
</style>
