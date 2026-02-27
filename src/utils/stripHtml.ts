export const stripHtml = (html?: string): string => {
  if (!html) return '';
  const div = document.createElement('div');

  const withSpaces = html
    .replace(/<\/(p|div|br|li|h[1-6])>/gi, ' ')
    .replace(/<(p|div|li|br|h[1-6])[^>]*>/gi, ' ');

  div.innerHTML = withSpaces;

  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
};
