import './desktop-shell';
import {
  desktopMediaPermissionRequest,
  resolveDesktopMediaPermission
} from '../../src/services/desktop-media-permissions';

export const verifyPhysicalDevices = async (
  report: (step: string, details: Record<string, unknown>) => Promise<void>
) => {
  let passed = true;
  for (const kind of ['audio', 'video'] as const) {
    let expired = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const capture = navigator.mediaDevices.getUserMedia(
      kind === 'audio' ? { audio: true } : { video: true }
    );
    void capture.then(
      lateStream => {
        if (expired) lateStream.getTracks().forEach(track => track.stop());
      },
      () => {}
    );
    try {
      const deadline = Date.now() + 10_000;
      while (
        !desktopMediaPermissionRequest.value ||
        !document.querySelector(
          '[data-testid="DesktopMediaPermissionDialog"]:modal'
        )
      ) {
        if (Date.now() >= deadline)
          throw new Error('Не появился запрос доступа приложения');
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const allow = document.querySelector<HTMLButtonElement>(
        '[data-testid="DesktopMediaPermissionDialog"] .desktop-media-permission__actions button:last-child'
      );
      if (!allow) throw new Error('Нет кнопки разрешения доступа');
      // Пользователь разрешил проверку устройств; системные настройки ОС не меняются.
      allow.click();
      stream = await Promise.race([
        capture,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new Error('Истекло ожидание устройства'));
          }, 20_000);
        })
      ]);
      const tracks = stream.getTracks().map(track => {
        const settings = track.getSettings();
        return {
          kind: track.kind,
          state: track.readyState,
          enabled: track.enabled,
          muted: track.muted,
          width: settings.width,
          height: settings.height,
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount
        };
      });
      if (!tracks.some(track => track.kind === kind && track.state === 'live'))
        throw new Error('Устройство не вернуло живой медиатрек');
      stream.getTracks().forEach(track => track.stop());
      await report('media-probe', {
        kind,
        captured: true,
        realDevices: true,
        customPermission: true,
        tracks
      });
    } catch (error) {
      passed = false;
      expired = true;
      resolveDesktopMediaPermission(false);
      await report('media-probe', {
        kind,
        captured: false,
        realDevices: true,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : String(error)
      });
    } finally {
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
    }
  }
  return passed;
};
