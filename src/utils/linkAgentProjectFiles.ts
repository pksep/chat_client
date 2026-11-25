import type { AgentProjectFile } from '../types/messages';

/** Связывает упоминания в уже очищенном HTML только с реальными файлами ответа. */
export function linkAgentProjectFiles(
  html: string,
  files: AgentProjectFile[]
): string {
  if (!files.length) return html;

  const template = document.createElement('template');
  template.innerHTML = html;
  const paths = new Map<string, number>();
  const normalize = (text: string): string =>
    text.replaceAll('\\', '/').replace(/^\.\//, '');
  files.forEach((file, index) => {
    paths.set(normalize(file.path), index);
    paths.set(normalize(file.relativePath), index);
  });

  function mark(link: HTMLAnchorElement, index: number): void {
    link.href = '#';
    link.removeAttribute('target');
    link.dataset.agentFile = String(index);
    link.title = 'Показать в папке';
  }

  for (const link of template.content.querySelectorAll('a')) {
    const href = link.getAttribute('href') ?? '';
    if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(href)) continue;
    let decoded = href;
    try {
      decoded = decodeURIComponent(href);
    } catch {
      /* Оставляем исходное написание пути. */
    }
    const index =
      paths.get(normalize(decoded)) ??
      paths.get(normalize(link.textContent ?? ''));
    if (index !== undefined) mark(link, index);
  }

  const escapeRegex = (text: string): string =>
    text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alternatives = [...paths.keys()]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(path => path.split('/').map(escapeRegex).join('[\\\\/]'));
  if (!alternatives.length) return template.innerHTML;

  const matcher = new RegExp(
    '(?<![\\p{L}\\p{N}_/\\\\.-])(?:\\.[\\\\/])?(?:' +
      alternatives.join('|') +
      ')(?![\\p{L}\\p{N}_/\\\\-]|\\.[\\p{L}\\p{N}])',
    'gu'
  );
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT
  );
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest('a,pre')) nodes.push(node);
  }
  for (const node of nodes) {
    const text = node.data;
    const fragment = document.createDocumentFragment();
    let end = 0;
    for (const match of text.matchAll(matcher)) {
      const link = document.createElement('a');
      link.textContent = match[0];
      mark(link, paths.get(normalize(match[0]))!);
      fragment.append(text.slice(end, match.index), link);
      end = match.index + match[0].length;
    }
    if (end) {
      fragment.append(text.slice(end));
      node.replaceWith(fragment);
    }
  }
  return template.innerHTML;
}
