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
  'data-span',
  'data-user-id',
  'start'
];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

const normalizeSafeAttributes = (template: HTMLTemplateElement): void => {
  template.content.querySelectorAll('[class]').forEach(normalizeClasses);

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
    FORBID_ATTR: ['style', 'src', 'srcset', 'xlink:href', 'formaction'],
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
