import { sanitizeMessageHtml } from './sanitizeMessageHtml';

export const copyMessageSelection = (event: ClipboardEvent): void => {
  const root = event.currentTarget;
  const selection = window.getSelection();

  if (
    event.defaultPrevented ||
    !event.clipboardData ||
    !(root instanceof HTMLElement) ||
    !selection ||
    selection.isCollapsed ||
    selection.rangeCount !== 1
  ) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return;
  }

  const container = document.createElement('div');
  let content: Node = range.cloneContents();
  let ancestor =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;

  // Сохраняем оформление текста, не добавляя вычисленные стили пузыря.
  while (ancestor && ancestor !== root) {
    const wrapper = ancestor.cloneNode(false);
    wrapper.appendChild(content);
    content = wrapper;
    ancestor = ancestor.parentElement;
  }

  container.appendChild(content);
  event.clipboardData.setData('text/plain', selection.toString());
  event.clipboardData.setData(
    'text/html',
    sanitizeMessageHtml(container.innerHTML)
  );
  event.preventDefault();
};
