const preservedPasteElements = new Set([
  'UL',
  'OL',
  'LI',
  'TABLE',
  'IMG',
  'VIDEO',
  'AUDIO',
  'HR'
]);

const isEmptyPasteNode = (node: Node): boolean => {
  if (node instanceof Element) {
    if (
      preservedPasteElements.has(node.tagName) ||
      node.hasAttribute('data-span')
    )
      return false;
    if (
      ['BR', 'META', 'LINK', 'STYLE', 'SCRIPT', 'TITLE'].includes(node.tagName)
    )
      return true;
    return [...node.childNodes].every(isEmptyPasteNode);
  }
  return (
    node.nodeType !== Node.TEXT_NODE ||
    /^[\s\u200b]*$/u.test(node.textContent || '')
  );
};

const trimPasteEdge = (
  parent: ParentNode,
  edge: 'firstChild' | 'lastChild'
) => {
  let node = parent[edge];
  while (node) {
    if (isEmptyPasteNode(node)) {
      node.remove();
    } else {
      if (
        node instanceof Element &&
        !preservedPasteElements.has(node.tagName) &&
        !node.hasAttribute('data-span')
      ) {
        trimPasteEdge(node, edge);
      }
      break;
    }
    node = parent[edge];
  }
};

export const trimEditorPasteHtml = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  trimPasteEdge(template.content, 'firstChild');
  trimPasteEdge(template.content, 'lastChild');
  return template.innerHTML;
};

export const trimEditorPasteText = (text: string): string => {
  const lines = text.split(/\r\n?|\n/);
  let first = 0;
  let last = lines.length;
  while (first < last && /^[\s\u200b]*$/u.test(lines[first])) first++;
  while (last > first && /^[\s\u200b]*$/u.test(lines[last - 1])) last--;
  return lines.slice(first, last).join('\n');
};
