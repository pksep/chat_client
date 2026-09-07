import DOMPurify from 'dompurify';

const MESSAGE_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'strike',
  'a',
  'span',
  'ul',
  'ol',
  'li',
  'code',
  'hr'
];
const MESSAGE_ALLOWED_ATTRIBUTES = [
  'href',
  'target',
  'rel',
  'class',
  'style',
  'data-span',
  'data-user-id',
  'start'
];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MESSAGE_ALLOWED_COLORS = new Set([
  '#181818',
  '#fedae9',
  '#d8c8ff',
  '#9cbeff',
  '#c8f8ff',
  '#57d278',
  '#ffcc00',
  '#ff6868'
]);

const normalizeMessageColor = (value: string): string | null => {
  const normalizedValue = value.trim().toLowerCase();

  if (MESSAGE_ALLOWED_COLORS.has(normalizedValue)) {
    return normalizedValue;
  }

  const rgbMatch = normalizedValue.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*1(?:\.0+)?)?\s*\)$/
  );

  if (!rgbMatch) {
    return null;
  }

  const channels = rgbMatch.slice(1, 4).map(Number);

  if (channels.some(channel => channel > 255)) {
    return null;
  }

  const hexValue = `#${channels
    .map(channel => channel.toString(16).padStart(2, '0'))
    .join('')}`;

  return MESSAGE_ALLOWED_COLORS.has(hexValue) ? hexValue : null;
};

const isSafeLink = (href: string): boolean => {
  const value = href.trim();

  return (
    /^(?:https?:|mailto:|tel:)/i.test(value) ||
    /^(?:\/(?!\/)|#|\?|\.\.?\/)/.test(value)
  );
};

const normalizeClasses = (element: Element): void => {
  if (!element.hasAttribute('class')) {
    return;
  }

  const allowedClasses =
    element.tagName === 'A'
      ? new Set(['link'])
      : element.tagName === 'SPAN'
        ? new Set(['link', 'message-content__text-mention'])
        : new Set<string>();
  const classes = [...element.classList].filter(className =>
    allowedClasses.has(className)
  );

  if (classes.length > 0) {
    element.setAttribute('class', classes.join(' '));
  } else {
    element.removeAttribute('class');
  }
};

const normalizeStyles = (element: HTMLElement): void => {
  if (element.tagName !== 'SPAN') {
    element.removeAttribute('style');
    return;
  }

  const color = normalizeMessageColor(
    element.style.getPropertyValue('color')
  );
  const backgroundColor = normalizeMessageColor(
    element.style.getPropertyValue('background-color')
  );

  element.removeAttribute('style');

  if (color) {
    element.style.setProperty('color', color);
  }

  if (backgroundColor) {
    element.style.setProperty('background-color', backgroundColor);
  }

  if (!element.style.length) {
    element.removeAttribute('style');
  }
};

const normalizeSafeAttributes = (template: HTMLTemplateElement): void => {
  template.content.querySelectorAll('[class]').forEach(normalizeClasses);
  template.content
    .querySelectorAll<HTMLElement>('[style]')
    .forEach(normalizeStyles);

  template.content.querySelectorAll<HTMLAnchorElement>('a').forEach(anchor => {
    const href = anchor.getAttribute('href');

    if (!href || !isSafeLink(href)) {
      anchor.removeAttribute('href');
    }

    if (anchor.getAttribute('target') === '_blank') {
      anchor.setAttribute('rel', 'noopener noreferrer');
    } else {
      anchor.removeAttribute('target');
      anchor.removeAttribute('rel');
    }
  });

  template.content
    .querySelectorAll<HTMLElement>('[data-user-id]')
    .forEach(element => {
      if (!UUID_PATTERN.test(element.dataset.userId || '')) {
        element.removeAttribute('data-user-id');
      }
    });

  template.content
    .querySelectorAll<HTMLOListElement>('ol[start]')
    .forEach(list => {
      if (!/^\d{1,6}$/.test(list.getAttribute('start') || '')) {
        list.removeAttribute('start');
      }
    });
};

export const sanitizeMessageHtml = (value?: string | null): string => {
  const sanitized = DOMPurify.sanitize(value || '', {
    ALLOWED_TAGS: MESSAGE_ALLOWED_TAGS,
    ALLOWED_ATTR: MESSAGE_ALLOWED_ATTRIBUTES,
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ['src', 'srcset', 'xlink:href', 'formaction'],
    FORBID_TAGS: [
      'style',
      'svg',
      'math',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
      'iframe',
      'object',
      'embed',
      'template'
    ],
    RETURN_TRUSTED_TYPE: false,
    SANITIZE_DOM: true,
    SANITIZE_NAMED_PROPS: true
  });
  const template = document.createElement('template');
  template.innerHTML = String(sanitized);
  normalizeSafeAttributes(template);

  return template.innerHTML;
};
