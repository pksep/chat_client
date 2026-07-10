type DocumentAppIconVariant = 'default' | 'call';

interface DocumentAppIconAssets {
  favicon: string;
  faviconSize: string;
  appleTouchIcon: string;
  manifest: string;
}

const DOCUMENT_APP_ICON_ASSETS: Record<
  DocumentAppIconVariant,
  DocumentAppIconAssets
> = {
  default: {
    favicon: '/images/pwa-64x64.png',
    faviconSize: '64x64',
    appleTouchIcon: '/images/apple-touch-icon-180x180.png',
    manifest: '/manifest.webmanifest'
  },
  call: {
    favicon: '/images/call-favicon-32x32.png',
    faviconSize: '32x32',
    appleTouchIcon: '/images/call-apple-touch-icon-180x180.png',
    manifest: '/call-manifest.webmanifest'
  }
};

const getOrCreateHeadLink = (id: string, rel: string): HTMLLinkElement => {
  const existingLink = document.getElementById(id) as HTMLLinkElement | null;

  if (existingLink) {
    return existingLink;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = rel;
  document.head.appendChild(link);

  return link;
};

const setIconLinks = (assets: DocumentAppIconAssets): void => {
  const iconLink = getOrCreateHeadLink('app-favicon', 'icon');
  iconLink.type = 'image/png';
  iconLink.sizes.value = assets.faviconSize;
  iconLink.href = assets.favicon;

  const appleTouchIconLink = getOrCreateHeadLink(
    'app-apple-touch-icon',
    'apple-touch-icon'
  );
  appleTouchIconLink.sizes.value = '180x180';
  appleTouchIconLink.href = assets.appleTouchIcon;
};

const setManifestLinks = (manifestHref: string): void => {
  const manifestLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]')
  );

  if (!manifestLinks.length) {
    getOrCreateHeadLink('app-manifest', 'manifest').href = manifestHref;
    return;
  }

  manifestLinks.forEach(link => {
    link.href = manifestHref;
  });
};

export const applyDocumentAppIcon = (variant: DocumentAppIconVariant): void => {
  if (typeof document === 'undefined') {
    return;
  }

  const assets = DOCUMENT_APP_ICON_ASSETS[variant];

  setIconLinks(assets);
  setManifestLinks(assets.manifest);
};

export const applyCallWindowDocumentIcon = (): void => {
  applyDocumentAppIcon('call');
};

export const restoreDefaultDocumentIcon = (): void => {
  applyDocumentAppIcon('default');
};
