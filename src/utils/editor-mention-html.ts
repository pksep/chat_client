// UI-kit читает подпись атомарного упоминания из атрибута content.
// В сообщениях этот служебный атрибут удалён, поэтому восстанавливаем его
// только при передаче HTML редактору, сохраняя видимый текст и ID.
export const prepareEditorMentionHtml = (html: string): string => {
  if (!html.includes('data-span')) return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const mentions = template.content.querySelectorAll('span[data-span]');
  if (!mentions.length) return html;
  mentions.forEach(element => {
    element.setAttribute(
      'content',
      element.textContent || element.getAttribute('content') || ''
    );
  });
  return template.innerHTML;
};
