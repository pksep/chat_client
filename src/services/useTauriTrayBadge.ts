import { TrayIcon } from '@tauri-apps/api/tray';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriRuntime } from './useTauriNotifications';

const TRAY_ICON_ID = 'sep-chat-tray';
const BASE_ICON_URL = '/images/pwa-64x64.png?v=20260731';
const BADGE_ICON_SIZE = 64;
const WINDOW_OVERLAY_ICON_SIZE = 32;
const BADGE_RED = '#E5484D';
const BADGE_GRAY = '#8C8C93';
const BADGE_TEXT = '#FFFFFF';
const BADGE_STROKE = 'transparent';
const BADGE_FONT = '"Segoe UI", sans-serif';
const BADGE_INSET = 1;
const WINDOW_OVERLAY_BADGE_HEIGHT = WINDOW_OVERLAY_ICON_SIZE - 4;

let baseTrayIconImagePromise: Promise<HTMLImageElement> | null = null;
let lastAppliedDesktopBadgeKey = '';

const isWindowsEnvironment = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };

  return /windows/i.test(
    navigatorWithUserAgentData.userAgentData?.platform ||
      navigator.userAgent ||
      ''
  );
};

const loadBaseTrayIconImage = (): Promise<HTMLImageElement> => {
  if (baseTrayIconImagePromise) {
    return baseTrayIconImagePromise;
  }

  baseTrayIconImagePromise = new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error(`Failed to load tray icon asset: ${BASE_ICON_URL}`));
    image.src = BASE_ICON_URL;
  });

  return baseTrayIconImagePromise;
};

const getUnreadLabel = (count: number): string => {
  if (count <= 0) {
    return 'SEP Chat';
  }

  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `SEP Chat: ${count} непрочитанных`;
  }

  if (lastDigit === 1) {
    return `SEP Chat: ${count} непрочитанное`;
  }

  return `SEP Chat: ${count} непрочитанных`;
};

const getBadgeText = (count: number): string => {
  if (count <= 0) {
    return '';
  }

  if (count > 99) {
    return '99+';
  }

  return String(count);
};

const drawRoundedBadge = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
};

const drawBadge = ({
  badgeHeight,
  count,
  iconSize,
  context,
  inset = BADGE_INSET,
  mutedOnly,
  showCount,
  topInset
}: {
  badgeHeight: number;
  count: number;
  iconSize: number;
  context: CanvasRenderingContext2D;
  inset?: number;
  mutedOnly: boolean;
  showCount: boolean;
  topInset: number;
}): void => {
  if (count <= 0) {
    return;
  }

  const badgeText = getBadgeText(count);
  const shouldRenderText = showCount && badgeText.length > 0;
  const isMultiDigit = badgeText.length >= 2;
  const horizontalPadding = shouldRenderText
    ? isMultiDigit
      ? Math.max(6, badgeHeight * 0.3)
      : badgeHeight * 0.55
    : 0;
  const maxBadgeWidth = iconSize - inset * 2;
  let fontSize = badgeText.length >= 3 ? 21 : badgeText.length === 2 ? 23 : 25;

  context.font = `400 ${fontSize}px ${BADGE_FONT}`;

  let badgeWidth = shouldRenderText
    ? Math.max(
        badgeHeight,
        Math.ceil(context.measureText(badgeText).width + horizontalPadding)
      )
    : badgeHeight;

  while (shouldRenderText && badgeWidth > maxBadgeWidth && fontSize > 10) {
    fontSize -= 1;
    context.font = `400 ${fontSize}px ${BADGE_FONT}`;
    badgeWidth = Math.max(
      badgeHeight,
      Math.ceil(context.measureText(badgeText).width + horizontalPadding)
    );
  }

  badgeWidth = Math.min(badgeWidth, maxBadgeWidth);

  const badgeX = iconSize - badgeWidth - inset;
  const badgeY = topInset;
  const badgeRadius = isMultiDigit
    ? Math.floor(badgeHeight * 0.4)
    : Math.floor(badgeHeight / 2);

  context.save();
  context.fillStyle = mutedOnly ? BADGE_GRAY : BADGE_RED;
  context.shadowColor = 'rgba(0, 0, 0, 0.18)';
  context.shadowBlur = 4;
  context.shadowOffsetY = 1;
  drawRoundedBadge(
    context,
    badgeX,
    badgeY,
    badgeWidth,
    badgeHeight,
    badgeRadius
  );
  context.fill();

  context.shadowColor = 'transparent';
  context.lineWidth = 2;
  context.strokeStyle = BADGE_STROKE;
  context.stroke();

  if (shouldRenderText) {
    context.fillStyle = BADGE_TEXT;
    context.font = `600 ${fontSize}px ${BADGE_FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(
      badgeText,
      badgeX + badgeWidth / 2,
      badgeY + badgeHeight / 2 + 0.5
    );
  }

  context.restore();
};

const renderTrayBadgeIcon = async (
  count: number,
  mutedOnly: boolean
): Promise<ArrayBuffer> => {
  const canvas = document.createElement('canvas');
  canvas.width = BADGE_ICON_SIZE;
  canvas.height = BADGE_ICON_SIZE;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to create tray badge canvas context');
  }

  const baseIcon = await loadBaseTrayIconImage();
  context.clearRect(0, 0, BADGE_ICON_SIZE, BADGE_ICON_SIZE);
  context.drawImage(baseIcon, 0, 0, BADGE_ICON_SIZE, BADGE_ICON_SIZE);

  drawBadge({
    badgeHeight: 30,
    count,
    iconSize: BADGE_ICON_SIZE,
    context,
    inset: BADGE_INSET,
    mutedOnly,
    showCount: false,
    topInset: BADGE_INSET
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blobResult => {
      if (blobResult) {
        resolve(blobResult);
        return;
      }

      reject(new Error('Failed to render tray badge icon blob'));
    }, 'image/png');
  });

  return blob.arrayBuffer();
};

const renderWindowOverlayIcon = async (
  count: number,
  mutedOnly: boolean
): Promise<ArrayBuffer | undefined> => {
  if (count <= 0) {
    return undefined;
  }

  const canvas = document.createElement('canvas');
  canvas.width = WINDOW_OVERLAY_ICON_SIZE;
  canvas.height = WINDOW_OVERLAY_ICON_SIZE;

  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to create window overlay icon canvas context');
  }

  context.clearRect(0, 0, WINDOW_OVERLAY_ICON_SIZE, WINDOW_OVERLAY_ICON_SIZE);

  drawBadge({
    badgeHeight: WINDOW_OVERLAY_BADGE_HEIGHT,
    count,
    iconSize: WINDOW_OVERLAY_ICON_SIZE,
    context,
    inset: 2,
    mutedOnly,
    showCount: true,
    topInset: 2
  });

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blobResult => {
      if (blobResult) {
        resolve(blobResult);
        return;
      }

      reject(new Error('Failed to render window overlay icon blob'));
    }, 'image/png');
  });

  return blob.arrayBuffer();
};

export const syncTauriTrayBadge = async ({
  count,
  force = false,
  mutedOnly
}: {
  count: number;
  force?: boolean;
  mutedOnly: boolean;
}): Promise<void> => {
  if (!isTauriRuntime()) {
    return;
  }

  const normalizedCount = Math.max(0, Math.floor(count || 0));
  const badgeKey = `${normalizedCount}:${mutedOnly ? 'muted' : 'active'}`;

  if (!force && lastAppliedDesktopBadgeKey === badgeKey) {
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    const trayIcon = await TrayIcon.getById(TRAY_ICON_ID);
    const isWindows = isWindowsEnvironment();

    if (trayIcon) {
      const iconBytes = await renderTrayBadgeIcon(normalizedCount, mutedOnly);

      await trayIcon.setIcon(iconBytes);
      await trayIcon.setTooltip(getUnreadLabel(normalizedCount));
    }

    if (isWindows) {
      const overlayIconBytes = await renderWindowOverlayIcon(
        normalizedCount,
        mutedOnly
      );

      await appWindow.setOverlayIcon(overlayIconBytes).catch(() => {});
    } else if (normalizedCount > 0) {
      await appWindow.setBadgeCount(normalizedCount).catch(() => {});
    } else {
      await appWindow.setBadgeCount(undefined).catch(() => {});
    }

    lastAppliedDesktopBadgeKey = badgeKey;
  } catch (error) {
    console.warn('Failed to sync Tauri desktop badge:', error);
  }
};
