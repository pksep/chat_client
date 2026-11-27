export const copyTextToClipboard = async (
  text: string | Promise<string>,
  targetWindow?: Pick<Window, 'navigator' | 'document'>
): Promise<void> => {
  const targetNavigator =
    targetWindow?.navigator ??
    (typeof navigator !== 'undefined' ? navigator : undefined);
  const targetDocument =
    targetWindow?.document ??
    (typeof document !== 'undefined' ? document : undefined);
  const host = targetDocument?.defaultView as
    | (Window & typeof globalThis)
    | null;
  if (
    typeof text !== 'string' &&
    targetNavigator?.clipboard?.write &&
    host?.ClipboardItem
  ) {
    const data = text.then(
      value => new host.Blob([value], { type: 'text/plain' })
    );
    void data.catch(() => {});
    try {
      // WebKit требует начать запись при клике, до ожидания ответа сервера.
      await targetNavigator.clipboard.write([
        new host.ClipboardItem({ 'text/plain': data })
      ]);
      return;
    } catch (error) {
      console.warn('Не удалось скопировать подготовленную ссылку:', error);
    }
  }
  const value = typeof text === 'string' ? text : await text;
  if (targetNavigator?.clipboard?.writeText) {
    try {
      await targetNavigator.clipboard.writeText(value);
      return;
    } catch (error) {
      console.warn(
        '[Clipboard] Navigator clipboard failed, using fallback.',
        error
      );
    }
  }

  if (!targetDocument?.body) {
    throw new Error('Буфер обмена недоступен');
  }

  const focused = targetDocument.activeElement as HTMLElement | null;
  const selection = targetDocument.getSelection();
  const ranges = selection
    ? Array.from({ length: selection.rangeCount }, (_, index) =>
        selection.getRangeAt(index).cloneRange()
      )
    : [];
  const textArea = targetDocument.createElement('textarea');
  textArea.value = value;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  // При открытом native dialog остальной документ inert: поле должно быть внутри.
  const container =
    targetDocument.querySelector('dialog:modal') || targetDocument.body;
  container.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, value.length);

  try {
    const isCopied = targetDocument.execCommand('copy');
    if (!isCopied) {
      throw new Error('Не удалось записать текст в буфер обмена');
    }
  } finally {
    textArea.remove();
    if (focused?.isConnected) focused.focus?.({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
  }
};
