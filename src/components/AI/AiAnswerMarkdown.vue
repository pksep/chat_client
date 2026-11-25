<template>
  <div
    v-if="body.nodes"
    v-emoji
    class="message-content__html ai-assistant__markdown"
    @click="openProjectFile"
  >
    <MarkdownNodes />
  </div>
  <div
    v-else
    v-emoji
    class="message-content__html ai-assistant__markdown"
    v-html="body.html"
    @click="openProjectFile"
  />
</template>

<script setup lang="ts">
import { computed, h, type VNodeChild } from 'vue';
import { renderAiMarkdown } from '../../utils/renderAiMarkdown';
import { linkAgentProjectFiles } from '../../utils/linkAgentProjectFiles';
import type { AgentProjectFile } from '../../types/messages';
import { revealAgentFile } from '../../services/desktop-agent-output';
import AiCodeBlock from './AiCodeBlock.vue';

const props = defineProps<{ content: string; files?: AgentProjectFile[] }>();
const body = computed(() => {
  const { html, snippets } = renderAiMarkdown(props.content);
  const linked = linkAgentProjectFiles(html, props.files ?? []);
  if (!snippets.length) return { html: linked };

  const template = document.createElement('template');
  template.innerHTML = linked;
  let index = 0;

  function renderNode(node: Node): VNodeChild {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent;
    if (!(node instanceof HTMLElement)) return null;
    if (node.tagName === 'PRE') return h(AiCodeBlock, snippets[index++]);

    const attrs = Object.fromEntries(
      Array.from(node.attributes, attr => [attr.name, attr.value])
    );
    if (!node.querySelector('pre'))
      return h(node.localName, { ...attrs, innerHTML: node.innerHTML });

    return h(node.localName, attrs, Array.from(node.childNodes, renderNode));
  }

  return { nodes: Array.from(template.content.childNodes, renderNode) };
});

const MarkdownNodes = (): VNodeChild => body.value.nodes;

function openProjectFile(event: MouseEvent): void {
  const link =
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[data-agent-file]')
      : null;
  if (!link) return;
  const file = props.files?.[Number(link.dataset.agentFile)];
  if (!file) return;
  event.preventDefault();
  event.stopPropagation();
  void revealAgentFile(file.path);
}
</script>
