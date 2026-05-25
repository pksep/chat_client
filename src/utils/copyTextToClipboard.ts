export const copyTextToClipboard = async (text: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      console.warn(
        '[Clipboard] Navigator clipboard failed, using fallback.',
        error
      );
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard is not available');
  }

  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.setAttribute('readonly', 'true');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  textArea.style.pointerEvents = 'none';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  textArea.setSelectionRange(0, text.length);

  try {
    const isCopied = document.execCommand('copy');
    if (!isCopied) {
      throw new Error('Copy command was rejected');
    }
  } finally {
    document.body.removeChild(textArea);
  }
};
